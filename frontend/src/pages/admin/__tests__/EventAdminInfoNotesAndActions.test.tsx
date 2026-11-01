/** EventAdminInfoNotesAndActionsのメモ欄と保存操作の表示テスト */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import EventAdminInfoNotesAndActions from '../EventAdminInfoNotesAndActions'

describe('EventAdminInfoNotesAndActions — メモ・保存操作', () => {
  it('nullのメモは空欄で表示し、文字列の入力は親へ渡す', () => {
    const onNotesChange = vi.fn()
    const { rerender } = render(
      <EventAdminInfoNotesAndActions
        notes={null}
        onNotesChange={onNotesChange}
        saving={false}
        uploading={false}
        loadFailed={false}
        isDirty={false}
      />,
    )

    const notes = screen.getByPlaceholderText('予約が必要なことや注意事項')
    expect(notes).toHaveValue('')

    // 1. 文字列のメモを親から受け取った場合、そのまま入力欄へ表示する
    rerender(
      <EventAdminInfoNotesAndActions
        notes="引き継ぎ事項"
        onNotesChange={onNotesChange}
        saving={false}
        uploading={false}
        loadFailed={false}
        isDirty={false}
      />,
    )
    expect(notes).toHaveValue('引き継ぎ事項')

    // 2. 入力値と空入力をそれぞれ親のcallbackへ渡す
    fireEvent.change(notes, { target: { value: '新しいメモ' } })
    expect(onNotesChange).toHaveBeenLastCalledWith('新しいメモ')
    fireEvent.change(notes, { target: { value: '' } })
    expect(onNotesChange).toHaveBeenLastCalledWith(null)
  })

  it('保存中・アップロード中・読み込み失敗時は保存ボタンを無効にする', () => {
    const onNotesChange = vi.fn()
    const { rerender } = render(
      <EventAdminInfoNotesAndActions
        notes={null}
        onNotesChange={onNotesChange}
        saving
        uploading={false}
        loadFailed={false}
        isDirty={false}
      />,
    )
    const saveButton = screen.getByRole('button', { name: '保存中...' })
    expect(saveButton).toBeDisabled()

    // 1. 保存中ではなくても画像をアップロード中なら保存できない
    rerender(
      <EventAdminInfoNotesAndActions
        notes={null}
        onNotesChange={onNotesChange}
        saving={false}
        uploading
        loadFailed={false}
        isDirty={false}
      />,
    )
    expect(screen.getByRole('button', { name: '保存する' })).toBeDisabled()

    // 2. データ読み込み失敗時も空フォームで上書きしないよう保存できない
    rerender(
      <EventAdminInfoNotesAndActions
        notes={null}
        onNotesChange={onNotesChange}
        saving={false}
        uploading={false}
        loadFailed
        isDirty={false}
      />,
    )
    expect(screen.getByRole('button', { name: '保存する' })).toBeDisabled()
  })

  it('未保存の時だけ注意を表示し、保存ボタンをsubmit型にする', () => {
    const onNotesChange = vi.fn()
    const { rerender } = render(
      <EventAdminInfoNotesAndActions
        notes="メモ"
        onNotesChange={onNotesChange}
        saving={false}
        uploading={false}
        loadFailed={false}
        isDirty
      />,
    )
    const saveButton = screen.getByRole('button', { name: '保存する' })
    expect(screen.getByText('未保存の変更があります')).toBeInTheDocument()
    expect(saveButton).toHaveAttribute('type', 'submit')

    // 1. dirtyでなくなった状態では未保存の注意を表示しない
    rerender(
      <EventAdminInfoNotesAndActions
        notes="メモ"
        onNotesChange={onNotesChange}
        saving={false}
        uploading={false}
        loadFailed={false}
        isDirty={false}
      />,
    )
    expect(screen.queryByText('未保存の変更があります')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存する' })).toHaveAttribute('type', 'submit')
  })
})
