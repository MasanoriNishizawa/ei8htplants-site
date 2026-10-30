import type { ChangeEvent, CSSProperties, RefObject } from 'react'
import { SectionBox } from './AdminInfoParts'
import EventGuidelinesImages, { type ImageUploadProgress } from './EventGuidelinesImages'

/** 出店要項セクションの表示値と、親画面が管理する操作を受け取る型 */
interface EventAdminInfoGuidelinesSectionProps {
  /** 要項の文章。未入力の場合は null または undefined */
  guidelinesText: string | null | undefined
  /** 文章欄のラベルに使う共通スタイル */
  labelStyle: CSSProperties
  /** 親画面から渡す共通入力欄スタイル */
  inputStyle: CSSProperties
  /** 要項画像の URL 一覧 */
  guidelineImages: string[]
  /** 画像のアップロード進捗。待機中は null */
  uploadProgress: ImageUploadProgress | null
  /** 画像のアップロード失敗メッセージ。表示しないときは null */
  uploadError: string | null
  /** 親画面で管理するファイル選択 input の参照 */
  fileInputRef: RefObject<HTMLInputElement | null>
  /** 親画面のアップロード処理へファイル選択イベントを渡す */
  onAddImages: (event: ChangeEvent<HTMLInputElement>) => void
  /** 親画面の確認処理付き削除へ画像位置を渡す */
  onRemoveImage: (index: number) => void
  /** 拡大表示中の画像位置。閉じている場合は null */
  viewerIndex: number | null
  /** 拡大表示の画像位置変更を親画面へ伝える */
  onChangeViewer: (index: number) => void
  /** 拡大表示を閉じる親画面の処理 */
  onCloseViewer: () => void
  /** 親画面のフォーム state に文章の変更を伝える */
  onGuidelinesTextChange: (value: string | null) => void
}

/**
 * 出店要項の文章欄と画像操作を既存の順序・構造で表示する。
 * 要項データ、アップロード処理、viewer state は所有せず、値と操作を親画面へ委譲する。
 * @param props - 表示値、共通ラベルスタイル、親画面が管理する操作関数
 * @returns 出店要項の SectionBox
 */
export default function EventAdminInfoGuidelinesSection({
  guidelinesText,
  labelStyle,
  inputStyle,
  guidelineImages,
  uploadProgress,
  uploadError,
  fileInputRef,
  onAddImages,
  onRemoveImage,
  viewerIndex,
  onChangeViewer,
  onCloseViewer,
  onGuidelinesTextChange,
}: EventAdminInfoGuidelinesSectionProps) {
  return (
    <SectionBox label="出店要項" hint="画像の追加・削除は「保存する」で確定します">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle} htmlFor="guidelines-text">要項の文章</label>
          <textarea
            id="guidelines-text"
            value={guidelinesText ?? ''}
            onChange={(e) => onGuidelinesTextChange(e.target.value || null)}
            rows={8}
            placeholder="主催者から届いた出店要項の本文を貼り付け"
            style={{ ...inputStyle, fontSize: 14, lineHeight: 1.7, resize: 'vertical' }}
          />
        </div>

        <EventGuidelinesImages
          urls={guidelineImages}
          uploadProgress={uploadProgress}
          uploadError={uploadError}
          labelStyle={labelStyle}
          fileInputRef={fileInputRef}
          onAddImages={onAddImages}
          onRemoveImage={onRemoveImage}
          viewerIndex={viewerIndex}
          onChangeViewer={onChangeViewer}
          onCloseViewer={onCloseViewer}
        />
      </div>
    </SectionBox>
  )
}
