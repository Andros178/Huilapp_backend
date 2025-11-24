const pool = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const https = require('https');
const FormData = require('form-data');

const JWT_SECRET = process.env.JWT_SECRET;

// =========================
// Helpers de validación
// =========================
const isValidEmail = (email) => {
  if (!email) return false;
  const trimmed = String(email).trim();
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(trimmed);
};

// Mínimo 8 caracteres y al menos 1 mayúscula
const isValidPassword = (password) => {
  if (!password) return false;
  const trimmed = String(password);
  const regex = /^(?=.*[A-Z]).{8,}$/;
  return regex.test(trimmed);
};

// =========================
// Envío de correo por Maileroo (API HTTP)
// =========================
const sendResetEmailViaMaileroo = (toEmail, resetCode) => {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.MAILEROO_API_KEY;
    const fromAddress = process.env.MAIL_FROM;

    if (!apiKey || !fromAddress) {
      return reject(
        new Error('Faltan MAILEROO_API_KEY o MAIL_FROM en las variables de entorno')
      );
    }

    const body = JSON.stringify({
      from: {
        address: fromAddress,
        display_name: 'Huilapp Soporte', // nombre que quieras mostrar
      },
      to: [
        {
          address: toEmail,
        },
      ],
      subject: 'Recuperación de contraseña',
      plain: `Tu código de recuperación es: ${resetCode} (expira en 15 minutos)`,
    });

    const options = {
      hostname: 'smtp.maileroo.com',
      port: 443,
      path: '/api/v2/emails',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        Authorization: `Bearer ${apiKey}`,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(
              new Error(
                `Maileroo API error ${res.statusCode}: ${data || 'sin cuerpo de respuesta'}`
              )
            );
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(body);
    req.end();
  });
};

// =========================
// Subida a ImgBB
// =========================
const uploadToImgbb = (fileBuffer, filename) => {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.IMGBB_API_KEY;
    const form = new FormData();
    form.append('image', fileBuffer, { filename });

    const request = https.request(
      {
        method: 'POST',
        host: 'api.imgbb.com',
        path: `/1/upload?key=${apiKey}`,
        headers: form.getHeaders(),
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.success) resolve(json.data.url);
            else reject(new Error(json.error?.message || 'Error subiendo imagen'));
          } catch (e) {
            reject(e);
          }
        });
      }
    );

    request.on('error', (err) => reject(err));
    form.pipe(request);
  });
};

// =========================
// Obtener todos los usuarios
// =========================
const getUsers = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM usuarios');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los usuarios' });
  }
};

// =========================
// Crear usuario
// =========================
const createUser = async (req, res) => {
  try {
    let { usuario, email, contrasena, nombre, apellidos, telefono, rol } = req.body;

    // Normalizar
    usuario = usuario?.trim();
    email = email?.trim();
    nombre = nombre?.trim();
    apellidos = apellidos?.trim();
    telefono = telefono?.trim();
    rol = rol?.trim();

    // Validar campos obligatorios
    if (!usuario || !email || !contrasena || !nombre || !apellidos) {
      return res.status(400).json({
        error:
          'Faltan campos obligatorios: usuario, email, contrasena, nombre, apellidos',
      });
    }

    // Validar email
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'El formato del correo no es válido' });
    }

    // Validar contraseña
    if (!isValidPassword(contrasena)) {
      return res.status(400).json({
        error:
          'La contraseña debe tener mínimo 8 caracteres y al menos una letra mayúscula',
      });
    }

    // Verificar que no exista ya el usuario o el correo
    const existing = await pool.query(
      'SELECT 1 FROM usuarios WHERE email = $1 OR usuario = $2',
      [email, usuario]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        error: 'Ya existe un usuario registrado con ese correo o nombre de usuario',
      });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(contrasena, saltRounds);

    let profile_picture = null;
    if (req.file) {
      console.log('Subiendo imagen de perfil a ImgBB...');
      profile_picture = await uploadToImgbb(req.file.buffer, req.file.originalname);
    }

    const result = await pool.query(
      `INSERT INTO usuarios (usuario, email, contrasena, nombre, apellidos, telefono, rol, profile_picture)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [usuario, email, hashedPassword, nombre, apellidos, telefono, rol || null, profile_picture]
    );

    res.status(201).json({ message: 'Usuario creado', usuario: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo crear el usuario' });
  }
};

// =========================
// Eliminar usuario
// =========================
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await pool.query('SELECT 1 FROM usuarios WHERE id = $1', [id]);
    if (!existing.rows.length) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
    res.json({ message: `Usuario ${id} eliminado` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo eliminar el usuario' });
  }
};

// =========================
// Actualizar usuario
// =========================
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    let { usuario, email, nombre, apellidos, telefono, rol } = req.body;

    usuario = usuario?.trim();
    email = email?.trim();
    nombre = nombre?.trim();
    apellidos = apellidos?.trim();
    telefono = telefono?.trim();
    rol = rol?.trim();

    // Obtener datos actuales (para mantener la imagen si no se reemplaza)
    const userCheck = await pool.query('SELECT * FROM usuarios WHERE id = $1', [id]);
    if (!userCheck.rows.length) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const currentUser = userCheck.rows[0];

    // Validar email si viene
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: 'El formato del correo no es válido' });
    }

    // Si cambia usuario o email, comprobar que no sean de otro usuario
    const newUsuario = usuario || currentUser.usuario;
    const newEmail = email || currentUser.email;

    const duplicate = await pool.query(
      'SELECT 1 FROM usuarios WHERE (email = $1 OR usuario = $2) AND id <> $3',
      [newEmail, newUsuario, id]
    );

    if (duplicate.rows.length > 0) {
      return res.status(400).json({
        error:
          'Ya existe otro usuario con ese correo o nombre de usuario, no puedes actualizar a esos valores',
      });
    }

    let profile_picture = currentUser.profile_picture;
    if (req.file) {
      console.log('Actualizando imagen de perfil...');
      profile_picture = await uploadToImgbb(req.file.buffer, req.file.originalname);
    }

    await pool.query(
      `UPDATE usuarios 
       SET usuario = $1, 
           email = $2, 
           nombre = $3, 
           apellidos = $4, 
           telefono = $5,
           rol = $6,
           profile_picture = $7
       WHERE id = $8`,
      [
        newUsuario,
        newEmail,
        nombre || currentUser.nombre,
        apellidos || currentUser.apellidos,
        telefono || currentUser.telefono,
        rol || currentUser.rol,
        profile_picture,
        id,
      ]
    );

    res.json({ message: `Usuario ${id} actualizado correctamente` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
};

// =========================
// Login de usuario
// =========================
const loginUser = async (req, res) => {
  try {
    let { email, contrasena } = req.body;

    email = email?.trim();

    if (!email || !contrasena) {
      return res
        .status(400)
        .json({ error: 'Faltan campos: email y contrasena son obligatorios' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'El formato del correo no es válido' });
    }

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
      { id: user.id, usuario: user.usuario, email: user.email, rol: user.rol },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    const { contrasena: _pw, reset_code, reset_expires, ...safeUser } = user;

    res.json({ message: 'Login exitoso', token, user: safeUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
};

// =========================
// Recuperación de contraseña
// =========================
const requestPasswordReset = async (req, res) => {
  try {
    let { email } = req.body;
    email = email?.trim();

    if (!email) {
      return res.status(400).json({ error: 'El correo es obligatorio' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'El formato del correo no es válido' });
    }

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

    let mailSent = false;

    try {
      if (process.env.MAILEROO_API_KEY && process.env.MAIL_FROM) {
        await sendResetEmailViaMaileroo(email, resetCode);
        mailSent = true;
      } else {
        console.warn(
          'MAILEROO_API_KEY o MAIL_FROM no configurados, no se envía email de recuperación'
        );
      }
    } catch (mailErr) {
      console.error('Error enviando email de recuperación (Maileroo API):', mailErr);
    }

    if (mailSent) {
      return res.json({ message: 'Código de recuperación enviado al correo' });
    }

    if (process.env.NODE_ENV !== 'production') {
      return res.json({
        message: 'Código generado (no enviado por email en este entorno)',
        resetCode,
      });
    }

    return res.json({ message: 'Código de recuperación generado. Revisa tu correo.' });
  } catch (error) {
    console.error('[requestPasswordReset] Error:', error);
    return res.status(500).json({ error: 'No se pudo enviar el código de recuperación' });
  }
};

// =========================
// Verificar código de recuperación
// Paso intermedio: email + code → resetToken
// =========================
const verifyResetCode = async (req, res) => {
  try {
    let { email, code } = req.body;

    email = email?.trim();
    code = code?.trim();

    if (!email || !code) {
      return res.status(400).json({
        error: 'Faltan campos: email y code son obligatorios',
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'El formato del correo no es válido' });
    }

    // Opcional: comprobar que el código tenga 4 dígitos numéricos
    if (!/^\d{4}$/.test(code)) {
      return res.status(400).json({ error: 'El código debe tener 4 dígitos numéricos' });
    }

    const result = await pool.query('SELECT * FROM usuarios WHERE email=$1', [email]);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Usuario no encontrado' });
    }

    const user = result.rows[0];

    // Validar código
    if (user.reset_code !== code) {
      return res.status(400).json({ error: 'Código inválido' });
    }

    // Validar expiración
    if (!user.reset_expires || new Date(user.reset_expires) < new Date()) {
      return res.status(400).json({ error: 'Código expirado' });
    }

    // Si el código es correcto, generamos un token temporal de reset
    const resetToken = jwt.sign(
      { email, type: 'password_reset' },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    return res.json({ message: 'Código válido', resetToken });
  } catch (error) {
    console.error('[verifyResetCode] Error:', error);
    return res.status(500).json({ error: 'No se pudo verificar el código' });
  }
};

// =========================
// Resetear contraseña (después de verificar código)
// =========================
const resetPassword = async (req, res) => {
  try {
    const { resetToken, nuevaContrasena, nuevaContrasena2 } = req.body;

    if (!resetToken || !nuevaContrasena || !nuevaContrasena2) {
      return res.status(400).json({
        error: 'Faltan campos: resetToken, nuevaContrasena, nuevaContrasena2',
      });
    }

    if (nuevaContrasena !== nuevaContrasena2) {
      return res.status(400).json({ error: 'Las contraseñas no coinciden' });
    }

    if (!isValidPassword(nuevaContrasena)) {
      return res.status(400).json({
        error:
          'La nueva contraseña debe tener mínimo 8 caracteres y al menos una letra mayúscula',
      });
    }

    let payload;
    try {
      payload = jwt.verify(resetToken, JWT_SECRET);
    } catch (e) {
      return res.status(400).json({ error: 'Token inválido o expirado' });
    }

    if (!payload || payload.type !== 'password_reset' || !payload.email) {
      return res.status(400).json({ error: 'Token de reseteo no válido' });
    }

    const email = payload.email;

    const result = await pool.query('SELECT * FROM usuarios WHERE email=$1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Usuario no encontrado' });
    }

    const user = result.rows[0];

    // Aseguramos que el código asociado todavía es válido (por si acaso)
    if (
      !user.reset_code ||
      !user.reset_expires ||
      new Date(user.reset_expires) < new Date()
    ) {
      return res.status(400).json({
        error: 'El código de recuperación ya no es válido, solicita uno nuevo',
      });
    }

    const hashedPassword = await bcrypt.hash(nuevaContrasena, 10);

    await pool.query(
      'UPDATE usuarios SET contrasena=$1, reset_code=NULL, reset_expires=NULL WHERE email=$2',
      [hashedPassword, email]
    );

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    console.error('[resetPassword] Error:', error);
    res.status(500).json({ error: 'No se pudo resetear la contraseña' });
  }
};

// =========================
// Cambiar contraseña (usuario autenticado)
// =========================
const changePassword = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { newPassword, newPassword2 } = req.body;

    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    if (!newPassword || !newPassword2) {
      return res
        .status(400)
        .json({ error: 'Faltan campos: newPassword, newPassword2' });
    }
    if (newPassword !== newPassword2) {
      return res.status(400).json({ error: 'Las contraseñas no coinciden' });
    }

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({
        error:
          'La nueva contraseña debe tener mínimo 8 caracteres y al menos una letra mayúscula',
      });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE usuarios SET contrasena=$1 WHERE id=$2', [hashed, userId]);

    return res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    console.error('Error en changePassword:', error);
    return res.status(500).json({ error: 'No se pudo cambiar la contraseña' });
  }
};

// =========================
// Logout de usuario
// =========================
const logoutUser = async (req, res) => {
  try {
    // JWT es stateless: el front debe borrar el token
    return res.json({
      message: 'Logout exitoso. El token debe eliminarse en el cliente.',
    });
  } catch (error) {
    console.error('Error en logoutUser:', error);
    return res.status(500).json({ error: 'No se pudo cerrar sesión' });
  }
};

module.exports = {
  getUsers,
  createUser,
  deleteUser,
  updateUser,
  loginUser,
  requestPasswordReset,
  verifyResetCode,
  resetPassword,
  changePassword,
  logoutUser,
};
