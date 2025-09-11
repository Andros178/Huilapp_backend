const pool = require('../db');

const createSite = async (req, res) => {
  try {
    const { nombre, categoria, subcategorias, fotos, pet_friendly, kids_friendly } = req.body;
    const id_usuario = req.user.id;

    if (!nombre || !categoria || !Array.isArray(subcategorias)) {
      return res.status(400).json({ error: 'Nombre, categoría y subcategorías son requeridos' });
    }

    const result = await pool.query(
      `INSERT INTO sitio (nombre, categoria, subcategorias, fotos, pet_friendly, kids_friendly, id_usuario)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [nombre, categoria, JSON.stringify(subcategorias), fotos ? JSON.stringify(fotos) : '[]', pet_friendly || false, kids_friendly || false, id_usuario]
    );

    res.json({ message: 'Sitio creado', sitio: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo crear el sitio' });
  }
};

const getMySites = async (req, res) => {
  try {
    const id_usuario = req.user.id;
    const result = await pool.query('SELECT * FROM sitio WHERE id_usuario = $1', [id_usuario]);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los sitios' });
  }
};

const updateSite = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, categoria, subcategorias, fotos, pet_friendly, kids_friendly } = req.body;
    const id_usuario = req.user.id;

    const siteCheck = await pool.query('SELECT * FROM sitio WHERE id_sitio=$1 AND id_usuario=$2', [id, id_usuario]);
    if (siteCheck.rows.length === 0) return res.status(403).json({ error: 'No tienes permiso para modificar este sitio' });

    const result = await pool.query(
      `UPDATE sitio SET nombre=$1, categoria=$2, subcategorias=$3, fotos=$4, pet_friendly=$5, kids_friendly=$6
       WHERE id_sitio=$7
       RETURNING *`,
      [nombre, categoria, JSON.stringify(subcategorias), fotos ? JSON.stringify(fotos) : '[]', pet_friendly || false, kids_friendly || false, id]
    );

    res.json({ message: 'Sitio actualizado', sitio: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo actualizar el sitio' });
  }
};

const deleteSite = async (req, res) => {
  try {
    const { id } = req.params;
    const id_usuario = req.user.id;

    const siteCheck = await pool.query('SELECT * FROM sitio WHERE id_sitio=$1 AND id_usuario=$2', [id, id_usuario]);
    if (siteCheck.rows.length === 0) return res.status(403).json({ error: 'No tienes permiso para eliminar este sitio' });

    await pool.query('DELETE FROM sitio WHERE id_sitio=$1', [id]);
    res.json({ message: 'Sitio eliminado' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo eliminar el sitio' });
  }
};

module.exports = {
  createSite,
  getMySites,
  updateSite,
  deleteSite
};
