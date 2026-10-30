/** 設計書のファイルツリーの1項目（フォルダならその中身を children に持つ） */
export interface DocTreeNode {
  /** ファイル（file）かフォルダ（dir）か */
  type: 'file' | 'dir'
  /** ファイル名・フォルダ名 */
  name: string
  /** doc/ からの相対パス */
  path: string
  /** フォルダの中身（ファイルなら無い） */
  children?: DocTreeNode[]
}
