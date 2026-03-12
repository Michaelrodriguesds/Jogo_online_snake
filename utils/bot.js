// ✅ Bot atualizado COM gridSize dinâmico

// Gera movimentos simples para cobras bots
function moveBot(snake, food, gridSize = 20) {
  const head = snake.body[0];
  let dx = 0, dy = 0;

  // Mover em direção à comida
  if (head.x < food.x) dx = gridSize;
  else if (head.x > food.x) dx = -gridSize;
  else if (head.y < food.y) dy = gridSize;
  else if (head.y > food.y) dy = -gridSize;

  return { dx, dy };
}

module.exports = { moveBot };