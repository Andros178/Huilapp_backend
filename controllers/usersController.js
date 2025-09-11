const pool = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET

const getUsers = async (req , res) => {
    try {
        const result = await pool.query('SELECT * FROM usuarios')
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({error: 'Error al obtener los usuarios'})
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


const deleteUser = async (req,res) =>{
    try {
        const {id} = req.params;
        await pool.query('DELETE FROM usuarios where id = $1' , [id]);
        res.json({message: `Usuario ${id} eliminado`})
    } catch (error) {
        console.error(error);
        res.status(500).json({error: 'No se pudo eliminar el usuario'})
    }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario, email, contrasena, nombre , apellidos, telefono } = req.body;
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



module.exports = {
  getUsers,
  createUser,
  deleteUser,
  updateUser,
  loginUser
};