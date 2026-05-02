export async function sendOrderConfirmation(order) {
  const lines = [
    '----- ORDER CONFIRMATION (dev stub) -----',
    `To:      ${order.account_email}`,
    `Subject: Order confirmed - ${order.id.slice(0, 8).toUpperCase()}`,
    '',
    `Hi ${order.account_name},`,
    '',
    'Your order has been confirmed. Items:',
    ...order.items.map((i) => `  - ${i.qty} x ${i.product_name}  (${i.line_total_points} pts)`),
    '',
    `Subtotal: ${order.subtotal_points} pts`,
  ];
  if (order.discount_points > 0) {
    lines.push(`Discount${order.discount_code_snapshot ? ` (${order.discount_code_snapshot})` : ''}: -${order.discount_points} pts`);
  }
  if (order.delivery_name_snapshot) {
    lines.push(`Delivery (${order.delivery_name_snapshot}): ${order.delivery_points} pts`);
  }
  if (order.notes) {
    lines.push('', `Note from Katie: ${order.notes}`);
  }
  lines.push(
    `Total: ${order.total_points} pts`,
    `Ref:   ${order.id}`,
    '----- end -----',
  );
  console.log(lines.join('\n'));
}
