const express = require('express');
const path = require('path');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// ── MONGODB CONNECTION ──
const MONGODB_URI = process.env.MONGODB_URI;
let db;

async function connectDB() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db('area51');
  console.log('✅ Connected to MongoDB Atlas');
}

function getCol() {
  return db.collection('transactions');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── GET all transactions for a month ──
app.get('/api/transactions', async (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: 'month param required' });
  const rows = await getCol()
    .find({ month })
    .sort({ date: 1, _id: 1 })
    .toArray();
  res.json(rows);
});

// ── POST add transaction ──
app.post('/api/transactions', async (req, res) => {
  const { date, item, price, paid_by } = req.body;
  if (!date || !item || price == null || !paid_by)
    return res.status(400).json({ error: 'Missing fields' });

  // get next id
  const last = await getCol().findOne({}, { sort: { id: -1 } });
  const nextId = last ? last.id + 1 : 1;

  const newTx = {
    id: nextId,
    date,
    item: item.trim(),
    price: parseFloat(price),
    paid_by,
    month: date.substring(0, 7),
    created_at: new Date().toISOString()
  };
  await getCol().insertOne(newTx);
  res.json(newTx);
});

// ── DELETE transaction ──
app.delete('/api/transactions/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  await getCol().deleteOne({ id });
  res.json({ success: true });
});

// ── GET summary for a month ──
app.get('/api/summary', async (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: 'month param required' });
  const rows = await getCol().find({ month }).toArray();
  const total = rows.reduce((s, r) => s + r.price, 0);
  const paidA = rows.filter(r => r.paid_by === 'A').reduce((s, r) => s + r.price, 0);
  const paidK = rows.filter(r => r.paid_by === 'K').reduce((s, r) => s + r.price, 0);
  const perPerson = total / 2;
  const balance = paidA - perPerson;
  res.json({ total, paidA, paidK, perPerson, balance });
});

// ── GET all months that have data ──
app.get('/api/months', async (req, res) => {
  const months = await getCol().distinct('month');
  months.sort().reverse();
  res.json(months);
});

// ── GET analysis ──
app.get('/api/analysis', async (req, res) => {
  const all = await getCol().find({}).toArray();

  const itemMap = {};
  all.forEach(t => {
    const key = t.item.toLowerCase();
    if (!itemMap[key]) itemMap[key] = { item: t.item, total: 0, count: 0 };
    itemMap[key].total += t.price;
    itemMap[key].count++;
  });
  const items = Object.values(itemMap).sort((a, b) => b.total - a.total).slice(0, 20);

  const monthMap = {};
  all.forEach(t => {
    if (!monthMap[t.month]) monthMap[t.month] = { month: t.month, total: 0 };
    monthMap[t.month].total += t.price;
  });
  const months = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));

  res.json({ items, months });
});

// ── START ──
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('❌ MongoDB connection failed:', err.message);
  process.exit(1);
});
