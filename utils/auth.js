const jwt = require('jsonwebtoken');

// Configuração JWT
const JWT_SECRET = process.env.JWT_SECRET || 'sua_chave_secreta_jwt';

/**
 * Middleware para autenticação de token JWT
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido ou expirado' });
    }
    
    req.user = user;
    next();
  });
}

module.exports = {
  authenticateToken
};