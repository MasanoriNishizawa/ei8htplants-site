from fastapi import APIRouter, HTTPException

router = APIRouter(prefix='/shipping', tags=['shipping'])

# 都道府県別送料（円）。実際の送料に合わせて変更してください
RATES: dict[str, int] = {
    '北海道': 1600,
    '青森県': 1200, '岩手県': 1200, '宮城県': 1200, '秋田県': 1200, '山形県': 1200, '福島県': 1200,
    '茨城県': 1000, '栃木県': 1000, '群馬県': 1000, '埼玉県': 1000, '千葉県': 1000,
    '東京都': 1000, '神奈川県': 1000, '山梨県': 1000, '長野県': 1000, '新潟県': 1000,
    '富山県': 1100, '石川県': 1100, '福井県': 1100, '静岡県': 1100,
    '愛知県': 1100, '三重県': 1100, '岐阜県': 1100,
    '大阪府': 1200, '京都府': 1200, '兵庫県': 1200, '奈良県': 1200, '和歌山県': 1200, '滋賀県': 1200,
    '鳥取県': 1300, '島根県': 1300, '岡山県': 1300, '広島県': 1300, '山口県': 1300,
    '香川県': 1300, '徳島県': 1300, '愛媛県': 1300, '高知県': 1300,
    '福岡県': 1400, '佐賀県': 1400, '長崎県': 1400, '熊本県': 1400,
    '大分県': 1400, '宮崎県': 1400, '鹿児島県': 1400,
    '沖縄県': 1800,
}

PREFECTURES = list(RATES.keys())


@router.get('/rate')
def get_rate(prefecture: str):
    fee = RATES.get(prefecture)
    if fee is None:
        raise HTTPException(400, f'未対応の都道府県です: {prefecture}')
    return {'fee': fee}


@router.get('/prefectures')
def list_prefectures():
    return PREFECTURES
