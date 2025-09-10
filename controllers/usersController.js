const pool = require('../db')

const getUsers = async (req , res) => {
    try {
        const result = await pool.query('SELECT * FROM usuarios')
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({error: 'Error al obtener los usuarios'})
    }
};

const createUser = async (req , res) =>{
    try {
        const {usuario,email,contrasena} = req.body;
        const result = await pool.query('INSERT INTO usuarios (usuario,email,contrasena) VALUES ($1,$2,$3) RETURNING *',
            [usuario,email,contrasena]
        );
        res.json({message: 'Usuario creado' , usuario : result.rows[0]});
    } catch (error) {
        console.error(error);
        res.status(500).json({error: 'No se pudo crear el usuario'})     
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



module.exports = {
    getUsers,
    createUser,
    deleteUser,
    updateUser
}