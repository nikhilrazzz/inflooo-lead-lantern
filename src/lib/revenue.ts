export function calculateProfit(budget: number, payout: number) {
  return (Math.round(budget * 100) - Math.round(payout * 100)) / 100;
}

export const formatMoney = (amount: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
}).format(amount);