"""検索向けの説明文・構造化データと、イベント専用の日付変換をまとめる。"""
import re
from datetime import date
from typing import Any, Optional, Pattern


# 説明文の上限は PageMeta.tsx 側の blocksToText の既定値に合わせる。
DESCRIPTION_MAX_LEN = 120
# Event の画像は構造化データに最大 5 枚まで含める。
EVENT_JSONLD_MAX_IMAGES = 5
# event.time / daily_times から時刻を抽出する。
_TIME_RE = re.compile(r'(\d{1,2}):(\d{2})')


def _str(value: Any) -> str:
    """文字列ならそのまま、それ以外（None・数値・dict など）は空文字を返す。

    Args:
        value: DB から読んだ値（型は決まっていない）。

    Returns:
        value が文字列ならそのまま、それ以外は空文字。
    """
    return value if isinstance(value, str) else ''


def _truncate(text: str, max_len: int = DESCRIPTION_MAX_LEN) -> str:
    """空白・改行を1つの空白にまとめ、上限を超えた文字列を省略する。

    Args:
        text: 切り詰める文字列。
        max_len: 「…」を含めた最大文字数。

    Returns:
        max_len 文字以内の文字列。
    """
    # 変数の内容: normalized: 空白や形式を整えた値。
    normalized = re.sub(r'\s+', ' ', text).strip()
    if len(normalized) <= max_len:
        return normalized
    return normalized[: max_len - 1] + '…'


def parse_date(value: Any) -> Optional[date]:
    """ISO形式の日付文字列を date にする。

    Args:
        value: YYYY-MM-DD または日付部分が先頭の文字列。

    Returns:
        読み取れた日付。形式が不正な場合は None。
    """
    # 変数の内容: value_text: 文字列へ変換した入力値。
    value_text = _str(value)[:10]
    try:
        return date.fromisoformat(value_text)
    except ValueError:
        return None


def format_date_label(start: Any, end: Any) -> str:
    """開催日を既存画面と同じ「2026年10月24日〜25日」形式にする。

    Args:
        start: 開始日（YYYY-MM-DD）。
        end: 終了日。None または開始日と同じなら単日表記。

    Returns:
        開催日の文字列。開始日を読めない場合は空文字。
    """
    # 1. 開始日を解析し、必要なら終了日も解析する。
    start_date = parse_date(start)
    if start_date is None:
        return ''
    # 変数の内容: end_date: 解析した終了日。
    end_date = parse_date(end)

    def format_one(day: date) -> str:
        """日付を年・月・日を含む日本語表記にする。

        Args:
            day: 表示形式に変換する日付。

        Returns:
            注釈に示した形式の応答（str）。
        """
        return f'{day.year}年{day.month}月{day.day}日'

    # 2. 単日・同月・別月の順で画面用の日付表記を選ぶ。
    if end_date is None or end_date == start_date:
        return format_one(start_date)
    if start_date.year == end_date.year and start_date.month == end_date.month:
        return f'{format_one(start_date)}〜{end_date.day}日'
    return f'{format_one(start_date)}〜{format_one(end_date)}'


def times_in(text: str, time_pattern: Pattern[str] = _TIME_RE) -> list[str]:
    """文字列に含まれる有効な時刻を HH:MM 形式で順に返す。

    Args:
        text: event.time または daily_times の時刻文字列。
        time_pattern: 時刻を抽出する正規表現。省略時は従来の形式を使う。

    Returns:
        24時・60分未満の時刻を HH:MM で並べたリスト。
    """
    # 変数の内容: result: 正常な時刻を HH:MM 形式で集める結果リスト。
    result = []
    # 変数の内容: hour: 抽出した時刻の時、minute: 抽出した時刻の分。
    for hour, minute in time_pattern.findall(text):
        if int(hour) < 24 and int(minute) < 60:
            result.append(f'{int(hour):02d}:{minute}')
    return result


def event_datetime(day: date, hhmm: Optional[str]) -> str:
    """構造化データ用の日付または日本時間の日時を作る。

    Args:
        day: 対象日。
        hhmm: HH:MM の時刻。None なら日付だけにする。

    Returns:
        YYYY-MM-DD または YYYY-MM-DDTHH:MM:00+09:00。
    """
    if hhmm:
        return f'{day.isoformat()}T{hhmm}:00+09:00'
    return day.isoformat()


def event_description(
    event: dict,
    *,
    default_description: str,
    description_max_len: int = DESCRIPTION_MAX_LEN,
) -> str:
    """イベント本文から、ページメタ情報に使う説明文を組み立てる。

    Args:
        event: イベント情報の dict。
        default_description: 本文や開催情報がない場合の既定説明。
        description_max_len: 説明文の最大文字数。

    Returns:
        hero の文言、concept、開催日と会場の順で採用した説明文。
    """
    # 1. ページ本文から hero と concept の文言を取り出して連結する。
    page_content = event.get('page_content') if isinstance(event.get('page_content'), dict) else {}
    hero = page_content.get('hero') if isinstance(page_content.get('hero'), dict) else {}
    parts = [_str(hero.get('tagline')), _str(hero.get('subtitle')), _str(page_content.get('concept'))]
    text = ' '.join(part.strip() for part in parts if part.strip())
    # 2. 本文が空なら開催日と会場で補い、上限を適用して既定文とともに返す。
    if not text:
        # 変数の内容: date_label: 利用者に表示する開催日、text: 生成または解析する本文。
        date_label = format_date_label(event.get('start_date'), event.get('end_date'))
        text = ' / '.join(part for part in (date_label, _str(event.get('location'))) if part)
    return _truncate(text, description_max_len) if text else default_description


def event_json_ld(
    event: dict,
    *,
    description: str,
    url: str,
    site_name: str,
    site_origin: str,
    default_image: str,
    max_images: int = EVENT_JSONLD_MAX_IMAGES,
    time_pattern: Pattern[str] = _TIME_RE,
) -> Optional[dict]:
    """schema.org Event の値を作る。必要な説明文や URL は呼び出し側から受け取る。

    Args:
        event: 画像 URL を含むイベント情報。
        description: ページの説明文。
        url: イベントページの canonical URL。
        site_name: 主催者名。
        site_origin: サイトの origin。
        default_image: 画像がない場合に使う OGP 画像。
        max_images: Event に含める画像の最大枚数。
        time_pattern: 時刻を抽出する正規表現。

    Returns:
        Event の dict。開始日が読めない、または住所が無ければ None。
    """
    # 変数の内容: start: 開催開始日または時刻。
    start = parse_date(event.get('start_date'))
    if start is None:
        return None
    # 変数の内容: daily: 日別の開催時間設定、end: 解析対象の終了位置、end_hhmm: 終了時刻の HH:MM 表記、end_text: 終了時刻の文字列、end_times: 終了時刻の候補一覧、start_hhmm: 開始時刻の HH:MM 表記、start_text: 開始時刻の文字列、start_times: 開始時刻の候補一覧。
    end = parse_date(event.get('end_date')) or start
    daily = event.get('daily_times') if isinstance(event.get('daily_times'), dict) else {}
    # 1. 開始日・終了日の個別時間帯を優先し、なければイベント共通の時刻を使う。
    start_text = _str(daily.get(start.isoformat())) or _str(event.get('time'))
    end_text = _str(daily.get(end.isoformat())) or _str(event.get('time'))
    start_times = times_in(start_text, time_pattern)
    end_times = times_in(end_text, time_pattern)
    # 2. 開始・終了の両時刻が揃うときだけ日時を使い、片方だけの日時化を避ける。
    start_hhmm: Optional[str] = start_times[0] if start_times else None
    end_hhmm: Optional[str] = end_times[1] if len(end_times) >= 2 else None
    if not (start_hhmm and end_hhmm):
        # 変数の内容: end_hhmm: 終了時刻の HH:MM 表記、start_hhmm: 開始時刻の HH:MM 表記。
        start_hhmm = end_hhmm = None
    # 3. Google の必須項目を満たす住所がない場合は Event を出さない。
    page_content = event.get('page_content') if isinstance(event.get('page_content'), dict) else {}
    venue = page_content.get('venue') if isinstance(page_content.get('venue'), dict) else {}
    address = _str(event.get('address')).strip() or _str(venue.get('address')).strip()
    if not address:
        return None
    # 変数の内容: images: 対象画像の一覧、location: イベントまたは店舗の場所。
    location: dict[str, Any] = {
        '@type': 'Place',
        'name': _str(event.get('location')) or site_name,
        'address': {'@type': 'PostalAddress', 'streetAddress': address, 'addressCountry': 'JP'},
    }
    # 4. 時刻・会場・主催者を含めた Event を返す。
    images = (event.get('image_urls') or [])[:max_images] or [default_image]
    return {
        '@context': 'https://schema.org',
        '@type': 'Event',
        'name': _str(event.get('name')),
        'startDate': event_datetime(start, start_hhmm),
        'endDate': event_datetime(end, end_hhmm),
        'eventStatus': 'https://schema.org/EventScheduled',
        'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode',
        'location': location,
        'image': images,
        'description': description,
        'url': url,
        'organizer': {'@type': 'Organization', 'name': site_name, 'url': site_origin},
    }


def organization_json_ld(*, site_name: str, site_origin: str, logo_url: str) -> dict:
    """トップページ用の schema.org Organization を作る。

    Args:
        site_name: 組織名。
        site_origin: 組織の origin。
        logo_url: 構造化データで使うロゴの絶対 URL。

    Returns:
        Organization の dict。
    """
    return {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        'name': site_name,
        'url': site_origin + '/',
        'logo': logo_url,
    }
