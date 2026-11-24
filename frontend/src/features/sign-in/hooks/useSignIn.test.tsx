import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../lib/api/ApiError";
import { signIn, type SessionInfo } from "../../../lib/api/session";
import { problem, sessionInfo } from "../../../test/fixtures";
import { useSignIn } from "./useSignIn";

vi.mock("../../../lib/api/session");

/** The `clearFailure` seen on each render. */
const clearSeen: Array<() => void> = [];

const lockedError = (
  retryAfter: number | null,
  code: "sign_in_locked" | "rate_limited" = "sign_in_locked",
) =>
  new ApiError(429, { title: "Sign-in locked", status: 429, code }, retryAfter);

/** Renders the hook's state as text next to two inputs, since the form binds to DOM refs. */
function Harness({ onSignedIn }: { onSignedIn: (info: SessionInfo) => void }) {
  const { register, submit, retry, clearFailure, submitting, failure } =
    useSignIn(onSignedIn);
  clearSeen.push(clearFailure);
  return (
    <form onSubmit={submit}>
      <input aria-label="u" {...register("username", { required: true })} />
      <input aria-label="p" {...register("password", { required: true })} />
      <button type="submit">go</button>
      <button type="button" onClick={retry}>
        retry
      </button>
      <button type="button" onClick={clearFailure}>
        clear
      </button>
      <p data-testid="submitting">{String(submitting)}</p>
      <p data-testid="failure">{failure ? JSON.stringify(failure) : "none"}</p>
    </form>
  );
}

async function fillAndSubmit(onSignedIn = vi.fn()) {
  render(<Harness onSignedIn={onSignedIn} />);
  await userEvent.type(screen.getByLabelText("u"), "admin");
  await userEvent.type(screen.getByLabelText("p"), "secret");
  await userEvent.click(screen.getByText("go"));
  return onSignedIn;
}

const failure = () => screen.getByTestId("failure").textContent;

beforeEach(() => {
  vi.resetAllMocks();
  clearSeen.length = 0;
});

describe("useSignIn", () => {
  it("on 200 calls back with the SessionInfo and sends the typed values", async () => {
    vi.mocked(signIn).mockResolvedValue(sessionInfo);
    const onSignedIn = await fillAndSubmit();
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(sessionInfo));
    expect(signIn).toHaveBeenCalledWith({
      username: "admin",
      password: "secret",
    });
    expect(failure()).toBe("none");
  });

  it("is submitting while the request is in flight", async () => {
    vi.mocked(signIn).mockReturnValue(new Promise(() => {}));
    await fillAndSubmit();
    await waitFor(() =>
      expect(screen.getByTestId("submitting").textContent).toBe("true"),
    );
  });

  it("maps 401 invalid_credentials and clears only the password", async () => {
    vi.mocked(signIn).mockRejectedValue(problem(401, "invalid_credentials"));
    await fillAndSubmit();
    await waitFor(() =>
      expect(failure()).toBe('{"kind":"invalid-credentials"}'),
    );
    expect(screen.getByLabelText("u")).toHaveValue("admin");
    expect(screen.getByLabelText("p")).toHaveValue("");
  });

  it("maps 403 https_required with its detail, and without one", async () => {
    vi.mocked(signIn).mockRejectedValueOnce(
      problem(403, "https_required", "Use HTTPS."),
    );
    await fillAndSubmit();
    await waitFor(() =>
      expect(failure()).toBe('{"kind":"https-required","detail":"Use HTTPS."}'),
    );
    expect(screen.getByLabelText("p")).toHaveValue("secret");

    vi.mocked(signIn).mockRejectedValueOnce(problem(403, "https_required"));
    await userEvent.click(screen.getByText("go"));
    await waitFor(() =>
      expect(failure()).toBe('{"kind":"https-required","detail":null}'),
    );
  });

  it.each([
    ["a network failure", new TypeError("Failed to fetch")],
    ["a 500", problem(500, "internal_error")],
    ["a 422", problem(422, "validation_failed")],
    ["a 429 sign_in_locked without Retry-After", lockedError(null)],
    ["a 429 sign_in_locked with a Retry-After of 0", lockedError(0)],
    [
      "a 429 rate_limited with a Retry-After of 30",
      lockedError(30, "rate_limited"),
    ],
    ["a 401 with another code", problem(401, "unauthenticated")],
  ])("maps %s to unexpected and keeps both values", async (_name, error) => {
    vi.mocked(signIn).mockRejectedValue(error);
    await fillAndSubmit();
    await waitFor(() => expect(failure()).toBe('{"kind":"unexpected"}'));
    expect(screen.getByLabelText("u")).toHaveValue("admin");
    expect(screen.getByLabelText("p")).toHaveValue("secret");
  });

  it("retry sends the same values again", async () => {
    vi.mocked(signIn).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const onSignedIn = await fillAndSubmit();
    await waitFor(() => expect(failure()).toBe('{"kind":"unexpected"}'));
    vi.mocked(signIn).mockResolvedValueOnce(sessionInfo);
    await userEvent.click(screen.getByText("retry"));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(sessionInfo));
    expect(signIn).toHaveBeenCalledTimes(2);
    expect(signIn).toHaveBeenLastCalledWith({
      username: "admin",
      password: "secret",
    });
  });

  it("maps a 429 sign_in_locked with a Retry-After to locked and keeps both values (FR-2)", async () => {
    vi.mocked(signIn).mockRejectedValue(lockedError(292));
    await fillAndSubmit();
    await waitFor(() =>
      expect(failure()).toBe('{"kind":"locked","seconds":292}'),
    );
    expect(screen.getByLabelText("u")).toHaveValue("admin");
    expect(screen.getByLabelText("p")).toHaveValue("secret");
  });

  it("sends nothing from submit or retry while locked, and sends again after clearFailure (FR-2)", async () => {
    vi.mocked(signIn).mockRejectedValueOnce(lockedError(292));
    await fillAndSubmit();
    await waitFor(() =>
      expect(failure()).toBe('{"kind":"locked","seconds":292}'),
    );
    expect(signIn).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByText("go"));
    await userEvent.click(screen.getByText("retry"));
    expect(signIn).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByText("clear"));
    expect(failure()).toBe("none");
    vi.mocked(signIn).mockResolvedValueOnce(sessionInfo);
    await userEvent.click(screen.getByText("go"));
    expect(signIn).toHaveBeenCalledTimes(2);
  });

  it("still submits after a failure that is not the lock", async () => {
    vi.mocked(signIn).mockRejectedValueOnce(
      problem(401, "invalid_credentials"),
    );
    await fillAndSubmit();
    await waitFor(() =>
      expect(failure()).toBe('{"kind":"invalid-credentials"}'),
    );
    vi.mocked(signIn).mockRejectedValueOnce(
      problem(401, "invalid_credentials"),
    );
    await userEvent.type(screen.getByLabelText("p"), "again");
    await userEvent.click(screen.getByText("go"));
    expect(signIn).toHaveBeenCalledTimes(2);
  });

  it("keeps the identity of clearFailure across renders", async () => {
    vi.mocked(signIn).mockRejectedValue(lockedError(5));
    await fillAndSubmit();
    await waitFor(() =>
      expect(failure()).toBe('{"kind":"locked","seconds":5}'),
    );
    expect(clearSeen.length).toBeGreaterThan(2);
    expect(new Set(clearSeen).size).toBe(1);
  });

  it("gives a second lock with the same seconds as a new object", async () => {
    const seen: unknown[] = [];
    function Probe() {
      const { register, submit, clearFailure, failure } = useSignIn(vi.fn());
      if (failure && !seen.includes(failure)) seen.push(failure);
      return (
        <form onSubmit={submit}>
          <input aria-label="u" {...register("username")} />
          <input aria-label="p" {...register("password")} />
          <button type="submit">go</button>
          <button type="button" onClick={clearFailure}>
            clear
          </button>
        </form>
      );
    }
    vi.mocked(signIn).mockRejectedValue(lockedError(60));
    render(<Probe />);
    await userEvent.type(screen.getByLabelText("u"), "admin");
    await userEvent.type(screen.getByLabelText("p"), "secret");
    await userEvent.click(screen.getByText("go"));
    await waitFor(() => expect(seen).toHaveLength(1));
    await act(async () => {
      await userEvent.click(screen.getByText("clear"));
    });
    await userEvent.click(screen.getByText("go"));
    await waitFor(() => expect(seen).toHaveLength(2));
    expect(seen[1]).toEqual(seen[0]);
    expect(seen[1]).not.toBe(seen[0]);
  });
});
