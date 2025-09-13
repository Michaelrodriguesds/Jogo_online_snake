// Gera movimentos simples para cobras bots
function moveBot(snake, food) {
  const head = snake.body[0];
  let dx = 0, dy = 0;

  if (head.x < food.x) dx = 20;
  else if (head.x > food.x) dx = -20;
  else if (head.y < food.y) dy = 20;
  else if (head.y > food.y) dy = -20;

  return { dx, dy };
}

module.exports = { moveBot };
