const express = require('express');
const app = express();
const port = 3001;

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Main API listening at http://localhost:${port}`);
});
