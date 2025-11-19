const pool = require('../db');


exports.createResena = async (req, res) => {
  try {
    const { id_sitio, texto, calificacion } = req.body;
    const id_usuario = req.user.id; 

    if (!id_sitio || !texto) {
      return res.status(400).json({ message: 'Faltan datos: id_sitio y texto son requeridos' });
    }

    // validar calificacion si viene (esperamos smallint, ej. 1-5)
    let cal = null;
    if (typeof calificacion !== 'undefined' && calificacion !== null && calificacion !== '') {
      cal = parseInt(calificacion, 10);
      if (isNaN(cal) || cal < 0 || cal > 5) {
        return res.status(400).json({ message: 'Calificación inválida (debe ser 0-5)'});
      }
    }

    // Insert the review and return it joined with the user's display name in one query
    const result = await pool.query(
      `WITH ins AS (
         INSERT INTO resenas (id_sitio, id_usuario, texto, calificacion)
         VALUES ($1, $2, $3, $4)
         RETURNING *
       )
       SELECT ins.*, u.nombre AS autor
       FROM ins
       LEFT JOIN usuarios u ON ins.id_usuario = u.id`,
      [id_sitio, id_usuario, texto, cal]
    );

    const created = result.rows[0];
    res.json({ message: 'Reseña creada', resena: created });
  } catch (err) {
    console.error('Error en createResena:', err);
    res.status(500).json({ error: 'Error creando reseña' });
  }
};


exports.getResenasBySitio = async (req, res) => {
  try {
    const { id_sitio } = req.params;

    const result = await pool.query(
      `SELECT r.id_resena, r.texto, r.created_at, r.id_usuario, r.calificacion, u.nombre AS autor
       FROM resenas r
       JOIN usuarios u ON r.id_usuario = u.id
       WHERE r.id_sitio = $1
       ORDER BY r.created_at DESC`,
      [id_sitio]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error en getResenasBySitio:', err);
    res.status(500).json({ error: 'Error listando reseñas' });
  }
};


exports.updateResena = async (req, res) => {
  try {
    const { id_resena } = req.params;
    const { texto, calificacion } = req.body;
    const id_usuario = req.user.id;

    if (!texto) {
      return res.status(400).json({ message: 'El texto es requerido' });
    }

    
    const check = await pool.query(
      `SELECT * FROM resenas WHERE id_resena = $1 AND id_usuario = $2`,
      [id_resena, id_usuario]
    );

    if (check.rows.length === 0) {
      return res.status(403).json({ message: 'No puedes editar esta reseña' });
    }

    // permitir actualizar texto y/o calificacion
    if (typeof calificacion !== 'undefined') {
      const cal = parseInt(calificacion, 10);
      if (isNaN(cal) || cal < 0 || cal > 5) {
        return res.status(400).json({ message: 'Calificación inválida (debe ser 0-5)'});
      }
      const result = await pool.query(
        `UPDATE resenas SET texto = $1, calificacion = $2 WHERE id_resena = $3 RETURNING *`,
        [texto, cal, id_resena]
      );
      return res.json({ message: 'Reseña actualizada', resena: result.rows[0] });
    } else {
      const result = await pool.query(
        `UPDATE resenas SET texto = $1 WHERE id_resena = $2 RETURNING *`,
        [texto, id_resena]
      );
      return res.json({ message: 'Reseña actualizada', resena: result.rows[0] });
    }

  } catch (err) {
    console.error('Error en updateResena:', err);
    res.status(500).json({ error: 'Error actualizando reseña' });
  }
};


exports.deleteResena = async (req, res) => {
  try {
    const { id_resena } = req.params;
    const id_usuario = req.user.id;

 
    const check = await pool.query(
      `SELECT * FROM resenas WHERE id_resena = $1 AND id_usuario = $2`,
      [id_resena, id_usuario]
    );

    if (check.rows.length === 0) {
      return res.status(403).json({ message: 'No puedes eliminar esta reseña' });
    }

    await pool.query(`DELETE FROM resenas WHERE id_resena = $1`, [id_resena]);

    res.json({ message: 'Reseña eliminada' });
  } catch (err) {
    console.error('Error en deleteResena:', err);
    res.status(500).json({ error: 'Error eliminando reseña' });
  }
};
