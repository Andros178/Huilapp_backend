const pool = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const JWT_SECRET = process.env.JWT_SECRET;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const getUsers = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM usuarios');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los usuarios' });
  }
};

const createUser = async (req, res) => {
  try {
    const { usuario, email, contrasena, nombre, apellidos, telefono } = req.body;

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(contrasena, saltRounds);

    const result = await pool.query(
      'INSERT INTO usuarios (usuario,email,contrasena,nombre,apellidos,telefono) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [usuario, email, hashedPassword, nombre, apellidos, telefono]
    );

    res.json({ message: 'Usuario creado', usuario: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo crear el usuario' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
    res.json({ message: `Usuario ${id} eliminado` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo eliminar el usuario' });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario, email } = req.body;
    await pool.query(
      'UPDATE usuarios SET usuario=$1, email=$2 WHERE id=$3',
      [usuario, email, id]
    );
    res.json({ message: `Usuario ${id} actualizado` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, contrasena } = req.body;

    const result = await pool.query('SELECT * FROM usuarios WHERE email=$1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Usuario no encontrado' });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(contrasena, user.contrasena);
    if (!match) {
      return res.status(400).json({ error: 'Contraseña incorrecta' });
    }

    const token = jwt.sign(
      { id: user.id, usuario: user.usuario, email: user.email },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    res.json({ message: 'Login exitoso', token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
};

const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    const result = await pool.query('SELECT * FROM usuarios WHERE email=$1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Usuario no encontrado' });
    }

    const resetCode = Math.floor(1000 + Math.random() * 9000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      'UPDATE usuarios SET reset_code=$1, reset_expires=$2 WHERE email=$3',
      [resetCode, expires, email]
    );

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: email,
      subject: 'Recuperación de contraseña',
      text: `Tu código de recuperación es: ${resetCode} (expira en 15 minutos)`,
    });

    res.json({ message: 'Código de recuperación enviado al correo' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo enviar el código de recuperación' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email, code, nuevaContrasena } = req.body;

    const result = await pool.query('SELECT * FROM usuarios WHERE email=$1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Usuario no encontrado' });
    }

    const user = result.rows[0];

    if (user.reset_code !== code || new Date(user.reset_expires) < new Date()) {
      return res.status(400).json({ error: 'Código inválido o expirado' });
    }

    const hashedPassword = await bcrypt.hash(nuevaContrasena, 10);

    await pool.query(
      'UPDATE usuarios SET contrasena=$1, reset_code=NULL, reset_expires=NULL WHERE email=$2',
      [hashedPassword, email]
    );

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo resetear la contraseña' });
  }
};

const changePassword = async (req, res) => {
  try {
    const userId = req.user?.id; 
    const { newPassword, newPassword2 } = req.body;

    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    if (!newPassword || !newPassword2) {
      return res.status(400).json({ error: 'Faltan campos: newPassword, newPassword2' });
    }
    if (newPassword !== newPassword2) {
      return res.status(400).json({ error: 'Las contraseñas no coinciden' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE usuarios SET contrasena=$1 WHERE id=$2', [hashed, userId]);

    return res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    console.error('Error en changePassword:', error);
    return res.status(500).json({ error: 'No se pudo cambiar la contraseña' });
  }
};

module.exports = {
  getUsers,
  createUser,
  deleteUser,
  updateUser,
  loginUser,
  requestPasswordReset,
  resetPassword,
  changePassword
};
