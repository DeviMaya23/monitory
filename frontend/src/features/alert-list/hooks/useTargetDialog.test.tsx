import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeEmailTarget } from '../../../test/fixtures'
import { useTargetDialog } from './useTargetDialog'

describe('useTargetDialog', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => useTargetDialog())
    expect(result.current.state.mode).toBe('none')
  })

  it('openAdd sets the add mode and keeps the opener', () => {
    const { result } = renderHook(() => useTargetDialog())
    const opener = document.createElement('button')
    act(() => result.current.openAdd(opener))
    expect(result.current.state).toMatchObject({ mode: 'add', opener })
  })

  it('openEdit sets the edit mode with a snapshot that a later change to the object does not touch', () => {
    const { result } = renderHook(() => useTargetDialog())
    const target = makeEmailTarget({ name: 'Before' })
    act(() => result.current.openEdit(target, null))
    target.name = 'After'
    expect(result.current.state.mode === 'edit' && result.current.state.target.name).toBe('Before')
  })

  it('close clears it, and opening again gives a new nonce', () => {
    const { result } = renderHook(() => useTargetDialog())
    act(() => result.current.openAdd(null))
    const first = result.current.state.mode === 'add' ? result.current.state.nonce : -1
    act(() => result.current.close())
    expect(result.current.state.mode).toBe('none')
    act(() => result.current.openAdd(null))
    expect(result.current.state.mode === 'add' && result.current.state.nonce).not.toBe(first)
  })
})
