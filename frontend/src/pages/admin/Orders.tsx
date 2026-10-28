import { useEffect, useState } from 'react'
import { api, type Order, type OrderDetail } from '../../lib/api'
import { failMessage } from './errorMessage'
import { OrderTable } from './orders/OrderTable'
import { OrderDetailModal } from './orders/OrderDetailModal'
import { ShipInfoModal } from './orders/ShipInfoModal'
import { CARRIERS, ORDER_ERROR_BOX_STYLE } from './orders/orderPresentation'

/**
 * 注文管理。一覧・ステータス変更・発送情報入力・詳細確認を行うページ
 * @returns 注文の表と、発送情報・詳細のモーダル
 */
export default function AdminOrders() {
  /** 注文の一覧 */
  const [orders, setOrders] = useState<Order[]>([])
  /** 一覧を読み込み中か */
  const [loading, setLoading] = useState(true)
  /** 詳細モーダルに出している注文（null なら閉じている） */
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  /** ステータスの変更を送信中か（ボタン・select を無効にする） */
  const [updating, setUpdating] = useState(false)
  /** 一覧の読み込み・ステータス変更・詳細の取得の失敗の文言（一覧の上か詳細モーダルの中に出す） */
  const [pageError, setPageError] = useState('')

  /** 発送情報の入力モーダルの対象（null なら閉じている） */
  const [shipModal, setShipModal] = useState<{ orderId: string } | null>(null)
  /** 発送モーダルで選んだ配送会社 */
  const [carrier, setCarrier] = useState(CARRIERS[0])
  /** 発送モーダルのお問い合わせ番号（任意） */
  const [trackingNumber, setTrackingNumber] = useState('')
  /** 発送確定の失敗の文言（発送モーダルの中に出す） */
  const [shipError, setShipError] = useState('')

  // 画面を開いたときに注文の一覧を読み込む
  useEffect(() => {
    api.orders.list()
      .then(setOrders)
      .catch((e: unknown) => setPageError(failMessage('注文の読み込みに失敗しました', e)))
      .finally(() => setLoading(false))
  }, [])

  /**
   * 発送情報の入力モーダルを開く（入力は初期値に戻す）
   * @param orderId - 発送済みにする注文の id
   * @returns 戻り値なし。
   */
  const openShipModal = (orderId: string) => {
    setCarrier(CARRIERS[0])
    setTrackingNumber('')
    setShipError('')
    setShipModal({ orderId })
  }

  /**
   * 発送を確定する（お客様に発送通知メールが送られる）
   * 1. 送信中にする
   * 2. 成功したら一覧と詳細モーダルの両方に status・carrier・tracking_number を反映し、モーダルを閉じる
   * 3. 失敗したらモーダルを開いたまま（入力は残る）エラーを出す。もう一度押して再送できる
   * @returns 戻り値なし。
   */
  const confirmShip = async () => {
    if (!shipModal) return
    // 1. 送信中
    setUpdating(true)
    setShipError('')
    try {
      // 2. 成功
      /** 更新後の注文 */
      const updated = await api.orders.updateStatus(shipModal.orderId, 'shipped', carrier, trackingNumber || undefined)
      setOrders((prev) => prev.map((o) => o.id === updated.id ? updated : o))
      if (detail?.id === shipModal.orderId) setDetail((d) => d ? { ...d, status: 'shipped', carrier: updated.carrier, tracking_number: updated.tracking_number } : d)
      setShipModal(null)
    } catch (e) {
      // 3. 失敗
      setShipError(failMessage('発送済みへの変更に失敗しました', e))
    } finally {
      setUpdating(false)
    }
  }

  /**
   * ステータスを変更する。「発送済」は発送情報の入力が要るのでモーダルを開く
   * 失敗したら表示は元のまま（select も元の値に戻る）にしてエラーを出す
   * @param id - 注文の id
   * @param status - 新しいステータス
   * @returns 戻り値なし。
   */
  const handleStatusChange = async (id: string, status: string) => {
    if (status === 'shipped') { openShipModal(id); return }
    setUpdating(true)
    setPageError('')
    try {
      /** 更新後の注文 */
      const updated = await api.orders.updateStatus(id, status)
      setOrders((prev) => prev.map((o) => o.id === updated.id ? updated : o))
      if (detail?.id === id) setDetail((d) => d ? { ...d, status } : d)
    } catch (e) {
      setPageError(failMessage('ステータスの変更に失敗しました。元の状態のままです', e))
    } finally {
      setUpdating(false)
    }
  }

  /**
   * 注文の詳細（明細つき）を取得してモーダルを開く。失敗したら一覧の上にエラーを出す
   * @param id - 注文の id
   * @returns 戻り値なし。
   */
  const openDetail = async (id: string) => {
    setPageError('')
    try {
      setDetail(await api.orders.get(id))
    } catch (e) {
      setPageError(failMessage('注文の詳細の取得に失敗しました', e))
    }
  }

  return (
    <div>
      <h2 style={{ fontFamily: "'Cormorant Garamond', 'Noto Serif JP', serif", fontSize: 28, fontWeight: 300, margin: '0 0 24px' }}>注文管理</h2>

      {/* 詳細モーダルを開いているときは、エラーはモーダルの中に出す */}
      {pageError && !detail && <p role="alert" style={ORDER_ERROR_BOX_STYLE}>{pageError}</p>}

      {/* 注文一覧の表示を委譲し、イベント処理は親に残す */}
      <OrderTable
        orders={orders}
        loading={loading}
        updating={updating}
        onStatusChange={handleStatusChange}
        onOpenDetail={openDetail}
      />

      {/* 発送情報入力モーダル（詳細モーダルより手前に出す） */}
      {shipModal && (
        <ShipInfoModal
          carrier={carrier}
          trackingNumber={trackingNumber}
          error={shipError}
          updating={updating}
          onClose={() => setShipModal(null)}
          onCarrierChange={setCarrier}
          onTrackingNumberChange={setTrackingNumber}
          onConfirm={confirmShip}
        />
      )}

      {/* 詳細モーダル（暗い背景を押すと閉じる） */}
      {detail && (
        <OrderDetailModal
          detail={detail}
          updating={updating}
          error={pageError}
          onClose={() => setDetail(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  )
}
