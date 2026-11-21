package usecase_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/domain"
	"monitory/internal/usecase"
	"monitory/pkg/clock"
)

var checkTestStart = time.Date(2026, 11, 19, 8, 30, 0, 0, time.FixedZone("UTC-5", -5*60*60))

// checkTestHTTP is a usecase.HTTPTestProber that records its calls, can advance the
// clock during an attempt, and returns a canned outcome or error.
type checkTestHTTP struct {
	outcome domain.HTTPTestOutcome
	err     error
	advance time.Duration
	clk     *clock.Fake
	onCall  func()
	calls   []domain.HTTPCheck
}

func (p *checkTestHTTP) TestHTTP(_ context.Context, check domain.HTTPCheck) (domain.HTTPTestOutcome, error) {
	p.calls = append(p.calls, check)
	p.clk.Advance(p.advance)
	if p.onCall != nil {
		p.onCall()
	}
	return p.outcome, p.err
}

// checkTestTCP is a usecase.TCPTestProber, the same.
type checkTestTCP struct {
	result  domain.CheckResult
	err     error
	advance time.Duration
	clk     *clock.Fake
	calls   []domain.TCPCheck
}

func (p *checkTestTCP) CheckTCP(_ context.Context, check domain.TCPCheck) (domain.CheckResult, error) {
	p.calls = append(p.calls, check)
	p.clk.Advance(p.advance)
	return p.result, p.err
}

type checkTester struct {
	svc  *usecase.ServiceCheckTestService
	http *checkTestHTTP
	tcp  *checkTestTCP
	clk  *clock.Fake
}

// newCheckTester builds the service with exactly the two probers, the clock and the
// limits: nothing it is given can write.
func newCheckTester() checkTester {
	clk := clock.NewFake(checkTestStart)
	h := &checkTestHTTP{clk: clk, outcome: domain.HTTPTestOutcome{CheckResult: domain.CheckResult{Healthy: true}}}
	tc := &checkTestTCP{clk: clk, result: domain.CheckResult{Healthy: true}}
	return checkTester{svc: usecase.NewServiceCheckTestService(h, tc, clk, testLimits), http: h, tcp: tc, clk: clk}
}

func (c checkTester) test(t *testing.T, in domain.ServiceTestInput) domain.ServiceTestResult {
	t.Helper()
	res, err := c.svc.TestServiceCheck(context.Background(), in)
	require.NoError(t, err)
	return res
}

func httpTestInput(edit func(*domain.HTTPCheckInput)) domain.ServiceTestInput {
	in := validHTTP().Check
	if edit != nil {
		edit(&in.HTTP)
	}
	return domain.ServiceTestInput{Check: in}
}

func tcpTestInput() domain.ServiceTestInput {
	return domain.ServiceTestInput{Check: validTCP().Check}
}

func TestTestServiceCheck_HTTPAttempt(t *testing.T) {
	status := 418
	t.Run("everything reaches the prober, certificate check on", func(t *testing.T) {
		c := newCheckTester()
		c.http.outcome = domain.HTTPTestOutcome{
			CheckResult: domain.CheckResult{Healthy: true},
			HTTPStatus:  &status, Body: "tea", BodyTruncated: true,
		}
		res := c.test(t, domain.ServiceTestInput{
			Check: domain.CheckInput{Type: "http", HTTP: domain.HTTPCheckInput{
				Method:                  "POST",
				URL:                     "https://x/a",
				QueryParams:             []domain.NameValue{{Name: "q", Value: "1"}},
				Headers:                 []domain.NameValue{{Name: "X-A", Value: "b"}},
				BodyType:                "json",
				BodyContent:             `{"a":1}`,
				JSONRules:               []domain.JSONRule{{Field: "ok", FailingValue: false}},
				JSONRuleMode:            "all",
				CertificateCheckEnabled: true,
				CertMinDaysLeft:         ptr(30),
				IgnoreCertificateErrors: true,
			}},
			TimeoutSeconds: ptr(9),
		})
		require.Len(t, c.http.calls, 1)
		assert.Equal(t, domain.HTTPCheck{
			Method:                  "POST",
			URL:                     "https://x/a",
			Timeout:                 9 * time.Second,
			QueryParams:             []domain.NameValue{{Name: "q", Value: "1"}},
			Headers:                 []domain.NameValue{{Name: "X-A", Value: "b"}},
			BodyType:                domain.BodyTypeJSON,
			BodyContent:             `{"a":1}`,
			JSONRules:               []domain.JSONRule{{Field: "ok", FailingValue: false}},
			JSONRuleMode:            domain.JSONRuleModeAll,
			CertificateCheck:        true,
			CertMinDaysLeft:         30,
			IgnoreCertificateErrors: true,
		}, c.http.calls[0])
		assert.Empty(t, c.tcp.calls)
		assert.True(t, res.Healthy)
		assert.Nil(t, res.Failure)
		require.NotNil(t, res.HTTPStatus)
		assert.Equal(t, 418, *res.HTTPStatus)
		assert.Equal(t, "tea", res.Body)
		assert.True(t, res.BodyTruncated)
	})
	t.Run("certificate options off: no days", func(t *testing.T) {
		c := newCheckTester()
		c.test(t, httpTestInput(func(h *domain.HTTPCheckInput) {
			h.CertificateCheckEnabled = false
			h.CertMinDaysLeft = ptr(30) // sent but disabled
		}))
		require.Len(t, c.http.calls, 1)
		assert.False(t, c.http.calls[0].CertificateCheck)
		assert.Equal(t, 0, c.http.calls[0].CertMinDaysLeft)
		assert.False(t, c.http.calls[0].IgnoreCertificateErrors)
	})
	t.Run("empty body type and mode are none and any", func(t *testing.T) {
		c := newCheckTester()
		c.test(t, httpTestInput(nil))
		assert.Equal(t, domain.BodyTypeNone, c.http.calls[0].BodyType)
		assert.Equal(t, domain.JSONRuleModeAny, c.http.calls[0].JSONRuleMode)
	})
}

func TestTestServiceCheck_Trims(t *testing.T) {
	t.Run("http", func(t *testing.T) {
		c := newCheckTester()
		c.test(t, httpTestInput(func(h *domain.HTTPCheckInput) {
			h.URL = "  https://x/a \t"
			h.QueryParams = []domain.NameValue{{Name: " q ", Value: " v "}}
			h.Headers = []domain.NameValue{{Name: " X-A ", Value: "  b  "}}
			h.JSONRules = []domain.JSONRule{{Field: " a.b ", FailingValue: "x"}}
		}))
		got := c.http.calls[0]
		assert.Equal(t, "https://x/a", got.URL)
		assert.Equal(t, []domain.NameValue{{Name: "q", Value: " v "}}, got.QueryParams)
		assert.Equal(t, []domain.NameValue{{Name: "X-A", Value: "b"}}, got.Headers)
		assert.Equal(t, []domain.JSONRule{{Field: "a.b", FailingValue: "x"}}, got.JSONRules)
	})
	t.Run("tcp host", func(t *testing.T) {
		c := newCheckTester()
		in := tcpTestInput()
		in.Check.TCP.Host = "  db.local  "
		c.test(t, in)
		assert.Equal(t, "db.local", c.tcp.calls[0].Host)
	})
}

func TestTestServiceCheck_Timeout(t *testing.T) {
	c := newCheckTester()
	c.test(t, httpTestInput(nil))
	assert.Equal(t, 7*time.Second, c.http.calls[0].Timeout) // the configured default, not a literal

	in := httpTestInput(nil)
	in.TimeoutSeconds = ptr(13)
	c.test(t, in)
	assert.Equal(t, 13*time.Second, c.http.calls[1].Timeout)

	tcp := tcpTestInput()
	tcp.TimeoutSeconds = ptr(4)
	c.test(t, tcp)
	assert.Equal(t, 4*time.Second, c.tcp.calls[0].Timeout)
}

func TestTestServiceCheck_TCP(t *testing.T) {
	c := newCheckTester()
	in := tcpTestInput()
	in.Check.TCP = domain.TCPCheckInput{Host: " h.example ", Port: 6379}
	res := c.test(t, in)

	assert.Equal(t, []domain.TCPCheck{{Host: "h.example", Port: 6379, Timeout: 7 * time.Second}}, c.tcp.calls)
	assert.Empty(t, c.http.calls)
	assert.True(t, res.Healthy)
	assert.Nil(t, res.HTTPStatus)
	assert.Equal(t, "", res.Body)
	assert.False(t, res.BodyTruncated)
}

func TestTestServiceCheck_FailureIsAResult(t *testing.T) {
	status, field := 503, "a.b"
	failures := []domain.CheckFailure{
		{Code: domain.FailureTimedOut},
		{Code: domain.FailureCouldNotConnect},
		{Code: domain.FailureCertificateProblem},
		{Code: domain.FailureTooManyRedirects},
		{Code: domain.FailureInvalidOrMissingJSON},
		{Code: domain.FailureNon2xxStatus, HTTPStatus: &status},
		{Code: domain.FailureJSONRuleMatched, JSONRuleField: &field},
	}
	for _, f := range failures {
		t.Run("http "+string(f.Code), func(t *testing.T) {
			c := newCheckTester()
			c.http.outcome = domain.HTTPTestOutcome{CheckResult: domain.CheckResult{Failure: &f}}
			res := c.test(t, httpTestInput(nil))
			assert.False(t, res.Healthy)
			assert.Equal(t, &f, res.Failure)
		})
		t.Run("tcp "+string(f.Code), func(t *testing.T) {
			c := newCheckTester()
			c.tcp.result = domain.CheckResult{Failure: &f}
			res := c.test(t, tcpTestInput())
			assert.False(t, res.Healthy)
			assert.Equal(t, &f, res.Failure)
		})
	}
}

func TestTestServiceCheck_NoRetry(t *testing.T) {
	c := newCheckTester()
	c.http.outcome = domain.HTTPTestOutcome{CheckResult: domain.CheckResult{Failure: &domain.CheckFailure{Code: domain.FailureTimedOut}}}
	in := httpTestInput(nil)
	in.TimeoutSeconds = ptr(3)
	c.test(t, in)

	assert.Len(t, c.http.calls, 1)
	assert.Equal(t, 0, c.clk.Pending(), "no timer was started")
	assert.Equal(t, checkTestStart.UTC(), c.clk.Now(), "nothing waited")
}

func TestTestServiceCheck_Duration(t *testing.T) {
	tests := []struct {
		name    string
		advance time.Duration
		want    int
	}{
		{"1234 ms", 1234 * time.Millisecond, 1234},
		{"1999 microseconds rounds down", 1999 * time.Microsecond, 1},
		{"zero", 0, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name+" http", func(t *testing.T) {
			c := newCheckTester()
			c.http.advance = tt.advance
			assert.Equal(t, tt.want, c.test(t, httpTestInput(nil)).DurationMs)
		})
		t.Run(tt.name+" tcp", func(t *testing.T) {
			c := newCheckTester()
			c.tcp.advance = tt.advance
			assert.Equal(t, tt.want, c.test(t, tcpTestInput()).DurationMs)
		})
	}
	t.Run("a clock that went back is zero", func(t *testing.T) {
		c := newCheckTester()
		c.http.advance = -time.Second
		assert.Equal(t, 0, c.test(t, httpTestInput(nil)).DurationMs)
	})
}

func TestTestServiceCheck_BodyIsValidUTF8(t *testing.T) {
	status := 200
	body := func(b string) domain.HTTPTestOutcome {
		return domain.HTTPTestOutcome{CheckResult: domain.CheckResult{Healthy: true}, HTTPStatus: &status, Body: b}
	}
	tests := []struct {
		name, body, want string
	}{
		{"valid text is unchanged", "héllo ✓ 日本", "héllo ✓ 日本"},
		{"an invalid byte", "a\xffb", "a�b"},
		{"a character cut at the end", "ab" + "é"[:1], "ab�"},
		{"a three-byte character cut after two bytes", "x" + "✓"[:2], "x��"},
		{"empty", "", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := newCheckTester()
			c.http.outcome = body(tt.body)
			assert.Equal(t, tt.want, c.test(t, httpTestInput(nil)).Body)
		})
	}
}

// fieldsOfCheck are the errors of the check as a save reports them: the ones that are
// neither the name nor the settings nor a message.
func fieldsOfCheck(errs []domain.FieldError) []domain.FieldError {
	var out []domain.FieldError
	for _, e := range errs {
		if strings.HasPrefix(e.Field, "check.") {
			out = append(out, e)
		}
	}
	return out
}

func TestTestServiceCheck_ValidationMatchesSave(t *testing.T) {
	url30 := "https://" + chars(22)
	tests := []struct {
		name  string
		check domain.CheckInput
	}{
		{"missing type", domain.CheckInput{}},
		{"unknown type", domain.CheckInput{Type: "udp"}},
		{"bad method", httpTestInput(func(h *domain.HTTPCheckInput) { h.Method = "get" }).Check},
		{"empty method", httpTestInput(func(h *domain.HTTPCheckInput) { h.Method = "" }).Check},
		{"empty URL", httpTestInput(func(h *domain.HTTPCheckInput) { h.URL = "  " }).Check},
		{"URL too long", httpTestInput(func(h *domain.HTTPCheckInput) { h.URL = url30 + "a" }).Check},
		{"URL too long with the query parameters", httpTestInput(func(h *domain.HTTPCheckInput) {
			h.URL = url30
			h.QueryParams = []domain.NameValue{{Name: "a", Value: "b"}}
		}).Check},
		{"no http or https", httpTestInput(func(h *domain.HTTPCheckInput) { h.URL = "ftp://x" }).Check},
		{"too many and nameless query rows", httpTestInput(func(h *domain.HTTPCheckInput) {
			h.QueryParams = []domain.NameValue{{Name: ""}, {Name: "a"}, {Name: " "}}
		}).Check},
		{"header limits", httpTestInput(func(h *domain.HTTPCheckInput) {
			h.Headers = []domain.NameValue{{Name: ""}, {Name: chars(9), Value: chars(13)}, {Name: "ok"}}
		}).Check},
		{"body too long", httpTestInput(func(h *domain.HTTPCheckInput) { h.BodyContent = chars(17) }).Check},
		{"unknown body type", httpTestInput(func(h *domain.HTTPCheckInput) { h.BodyType = "xml" }).Check},
		{"too many JSON rules", httpTestInput(func(h *domain.HTTPCheckInput) {
			r := domain.JSONRule{Field: "a", FailingValue: "x"}
			h.JSONRules = []domain.JSONRule{r, r, r}
		}).Check},
		{"a rule without field or value", httpTestInput(func(h *domain.HTTPCheckInput) {
			h.JSONRules = []domain.JSONRule{{Field: " "}}
		}).Check},
		{"unknown rule mode", httpTestInput(func(h *domain.HTTPCheckInput) { h.JSONRuleMode = "some" }).Check},
		{"certificate check without days", httpTestInput(func(h *domain.HTTPCheckInput) { h.CertificateCheckEnabled = true }).Check},
		{"certificate check with 0 days", httpTestInput(func(h *domain.HTTPCheckInput) {
			h.CertificateCheckEnabled, h.CertMinDaysLeft = true, ptr(0)
		}).Check},
		{"certificate check with an http URL", httpTestInput(func(h *domain.HTTPCheckInput) {
			h.URL, h.CertificateCheckEnabled, h.CertMinDaysLeft = "http://x", true, ptr(3)
		}).Check},
		{"ignore errors with an http URL", httpTestInput(func(h *domain.HTTPCheckInput) {
			h.URL, h.IgnoreCertificateErrors = "http://x", true
		}).Check},
		{"tcp host empty", domain.CheckInput{Type: "tcp", TCP: domain.TCPCheckInput{Host: " ", Port: 80}}},
		{"tcp port 0", domain.CheckInput{Type: "tcp", TCP: domain.TCPCheckInput{Host: "h", Port: 0}}},
		{"tcp port 65536", domain.CheckInput{Type: "tcp", TCP: domain.TCPCheckInput{Host: "h", Port: 65536}}},
		{"several at once", httpTestInput(func(h *domain.HTTPCheckInput) {
			h.Method, h.URL, h.BodyType, h.JSONRuleMode = "x", "", "y", "z"
		}).Check},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			save := domain.ServiceInput{Name: "valid", Check: tt.check}
			want := fieldsOfCheck(usecase.ValidateServiceInput(save, testLimits))
			require.NotEmpty(t, want, "the save rejects this check")

			c := newCheckTester()
			_, err := c.svc.TestServiceCheck(context.Background(), domain.ServiceTestInput{Check: tt.check})
			var verr domain.ValidationError
			require.ErrorAs(t, err, &verr)
			assert.Equal(t, want, verr.Fields)
			assert.Empty(t, c.http.calls)
			assert.Empty(t, c.tcp.calls)
		})
	}

	t.Run("validation comes before an ended context", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		_, err := newCheckTester().svc.TestServiceCheck(ctx, domain.ServiceTestInput{})
		var verr domain.ValidationError
		require.ErrorAs(t, err, &verr)
	})
}

func TestTestServiceCheck_TimeoutRange(t *testing.T) {
	const msg = "The timeout is 2 to 20 seconds."
	for _, bad := range []int{0, 1, 21, -5} {
		c := newCheckTester()
		in := httpTestInput(nil)
		in.TimeoutSeconds = ptr(bad)
		_, err := c.svc.TestServiceCheck(context.Background(), in)
		var verr domain.ValidationError
		require.ErrorAs(t, err, &verr, "timeout %d", bad)
		assert.Equal(t, []domain.FieldError{fe("settings.timeout_seconds", domain.FieldErrorOutOfRange, msg)}, verr.Fields)
		assert.Empty(t, c.http.calls)
	}
	for _, ok := range []int{2, 20} {
		c := newCheckTester()
		in := tcpTestInput()
		in.TimeoutSeconds = ptr(ok)
		c.test(t, in)
		assert.Equal(t, time.Duration(ok)*time.Second, c.tcp.calls[0].Timeout)
	}
	t.Run("check errors come first, then the timeout", func(t *testing.T) {
		in := domain.ServiceTestInput{Check: domain.CheckInput{Type: "tcp"}, TimeoutSeconds: ptr(0)}
		_, err := newCheckTester().svc.TestServiceCheck(context.Background(), in)
		var verr domain.ValidationError
		require.ErrorAs(t, err, &verr)
		require.Len(t, verr.Fields, 3)
		assert.Equal(t, "check.host", verr.Fields[0].Field)
		assert.Equal(t, "check.port", verr.Fields[1].Field)
		assert.Equal(t, "settings.timeout_seconds", verr.Fields[2].Field)
	})
}

func TestTestServiceCheck_OnlyTheTimeoutIsChecked(t *testing.T) {
	// The interval, retries and the budget play no part in a test, and the name is not
	// part of the input: a save would reject each of these.
	save := validHTTP()
	save.CheckIntervalSeconds, save.RetryCount, save.RetryIntervalSeconds = ptr(1), ptr(99), ptr(0)
	save.TimeoutSeconds = ptr(20)
	save.Name = ""
	require.NotEmpty(t, usecase.ValidateServiceInput(save, testLimits))

	c := newCheckTester()
	res := c.test(t, domain.ServiceTestInput{Check: save.Check, TimeoutSeconds: save.TimeoutSeconds})
	assert.True(t, res.Healthy)
	assert.Len(t, c.http.calls, 1)
}

func TestTestServiceCheck_Errors(t *testing.T) {
	t.Run("the context ended during the attempt", func(t *testing.T) {
		c := newCheckTester()
		ctx, cancel := context.WithCancel(context.Background())
		c.http.onCall = cancel
		c.http.err = context.Canceled
		res, err := c.svc.TestServiceCheck(ctx, httpTestInput(nil))
		require.ErrorIs(t, err, context.Canceled)
		assert.Equal(t, domain.ServiceTestResult{}, res)
	})
	t.Run("an unexpected error of a probe is wrapped and hides the check", func(t *testing.T) {
		boom := errors.New("boom")
		for _, tcp := range []bool{false, true} {
			c := newCheckTester()
			c.http.err, c.tcp.err = boom, boom
			in := httpTestInput(func(h *domain.HTTPCheckInput) { h.URL = "https://secret.example/x" })
			if tcp {
				in = tcpTestInput()
			}
			res, err := c.svc.TestServiceCheck(context.Background(), in)
			require.ErrorIs(t, err, boom)
			assert.Equal(t, "run the check test: boom", err.Error())
			assert.Equal(t, domain.ServiceTestResult{}, res)
		}
	})
}
