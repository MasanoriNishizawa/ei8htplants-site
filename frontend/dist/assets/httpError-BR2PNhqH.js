function e(t){if(!(t instanceof Error))return null;const n=/^(\d{3})\b/.exec(t.message);return n?Number(n[1]):null}export{e as h};
