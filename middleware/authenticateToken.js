require('dotenv').config()
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization']; 
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Token requerido' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = user;
    req.user.isAdmin = user.rol === 'administrador';
    next();
  });
};

module.exports = authenticateToken;
