/** 小数第2位に丸め、-0 や指数表記を避けた数値文字列にする */
export function fmt(value: number): string {
  return Number(value.toFixed(2)).toString();
}
