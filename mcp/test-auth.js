// Simple test to verify auth routes work
import express from 'express';
import authRoutes from './dist/routes/auth.js';

const app = express();
app.use(express.json());

console.log('authRoutes type:', typeof authRoutes);
console.log('authRoutes:', authRoutes);

app.use('/auth', authRoutes);

// Test route to verify express is working
app.get('/test', (req, res) => {
  res.json({ message: 'Test route works' });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`);
  console.log('Try:');
  console.log(`  curl http://localhost:${PORT}/test`);
  console.log(`  curl http://localhost:${PORT}/auth/test`);
});