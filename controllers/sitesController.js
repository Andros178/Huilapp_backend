const fs = require('fs');
const path = require('path');
const https = require('https');
const pool = require('../db');


// ==========================
// Función para subir a ImgBB desde buffer
// ==========================
const uploadToImgbb = (fileBuffer, filename) => {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const FormData = require('form-data');
    const apiKey = process.env.IMGBB_API_KEY;

    const form = new FormData();
    form.append('image', fileBuffer, { filename });

    const request = https.request({
      method: 'POST',
      host: 'api.imgbb.com',
      path: `/1/upload?key=${apiKey}`,
      headers: form.getHeaders()
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.success) resolve(json.data.url);
          else reject(new Error(json.error?.message || 'Error subiendo imagen'));
        } catch (e) {
          reject(e);
        }
      });
    });

    request.on('error', err => reject(err));
    form.pipe(request);
  });
};

// ==========================
// Crear sitio
// ==========================
const createSite = async (req, res) => {
  try {
    console.log('req.body:', req.body);
    console.log('req.file:', req.file ? 'Archivo recibido' : 'NO HAY ARCHIVO');

  const { nombre, categoria, subcategorias, pet_friendly, kids_friendly, latitud, longitud, descripcion, direccion, telefono } = req.body;
    const id_usuario = req.user.id;

    if (!nombre || !categoria || !subcategorias) {
      return res.status(400).json({ error: 'Nombre, categoría y subcategorías son requeridos' });
    }

    // Ensure descripcion/direccion/telefono exist (DB requires non-null)
    if (typeof descripcion === 'undefined' || descripcion === null) {
      return res.status(400).json({ error: 'La descripción es requerida' });
    }
    if (typeof direccion === 'undefined' || direccion === null) {
      return res.status(400).json({ error: 'La dirección es requerida' });
    }
    if (typeof telefono === 'undefined' || telefono === null) {
      return res.status(400).json({ error: 'El teléfono es requerido' });
    }

    let subcatsArray;
    try {
      subcatsArray = Array.isArray(subcategorias) ? subcategorias : JSON.parse(subcategorias);
    } catch (err) {
      return res.status(400).json({ error: 'Subcategorías debe ser un array o string JSON' });
    }

    let fotos = [];
    if (req.file) {
      console.log('Archivo recibido, subiendo a ImgBB...');
      const imageUrl = await uploadToImgbb(req.file.buffer, req.file.originalname);
      fotos.push(imageUrl);
    }
    else {
      console.log('No se recibió archivo, creando sitio sin imagen.');
    }

    const lat = typeof latitud !== 'undefined' && latitud !== null && latitud !== '' ? parseFloat(latitud) : null;
    const lon = typeof longitud !== 'undefined' && longitud !== null && longitud !== '' ? parseFloat(longitud) : null;

    const result = await pool.query(
      `INSERT INTO sitio 
       (nombre, categoria, subcategorias, fotos, pet_friendly, kids_friendly, latitud, longitud, descripcion, direccion, telefono, id_usuario)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        nombre,
        categoria,
        JSON.stringify(subcatsArray),
        JSON.stringify(fotos),
        pet_friendly === 'true' || pet_friendly === true,
        kids_friendly === 'true' || kids_friendly === true,
        lat,
        lon,
        descripcion || '',
        direccion || '',
        telefono || '',
        id_usuario
      ]
    );

    console.log('Sitio creado en DB:', result.rows[0]);
    res.json({ message: 'Sitio creado', sitio: result.rows[0] });
  } catch (error) {
    console.error('Error en createSite:', error);
    res.status(500).json({ error: 'No se pudo crear el sitio' });
  }
};



// ==========================
// Obtener mis sitios
// ==========================
const getMySites = async (req, res) => {
  try {
    const id_usuario = req.user.id;
    const result = await pool.query('SELECT * FROM sitio WHERE id_usuario = $1', [id_usuario]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error en getMySites:', error);
    res.status(500).json({ error: 'Error al obtener los sitios' });
  }
};

// ==========================
// Actualizar sitio
// ==========================
const updateSite = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, categoria, subcategorias, fotos, pet_friendly, kids_friendly, latitud, longitud } = req.body;
    const id_usuario = req.user.id;

    const siteCheck = await pool.query('SELECT * FROM sitio WHERE id_sitio=$1 AND id_usuario=$2', [id, id_usuario]);
    if (!siteCheck.rows.length) return res.status(403).json({ error: 'No tienes permiso para modificar este sitio' });

    let subcatsArray = [];
    if (subcategorias) {
      try {
        subcatsArray = Array.isArray(subcategorias) ? subcategorias : JSON.parse(subcategorias);
      } catch (err) {
        return res.status(400).json({ error: 'Subcategorías debe ser un array o string JSON' });
      }
    }

    const newFotos = fotos ? JSON.stringify(fotos) : (siteCheck.rows[0].fotos || '[]');
    const pet = typeof pet_friendly !== 'undefined' ? (pet_friendly === 'true' || pet_friendly === true) : (siteCheck.rows[0].pet_friendly || false);
    const kids = typeof kids_friendly !== 'undefined' ? (kids_friendly === 'true' || kids_friendly === true) : (siteCheck.rows[0].kids_friendly || false);
    const lat = typeof latitud !== 'undefined' && latitud !== null && latitud !== '' ? parseFloat(latitud) : (siteCheck.rows[0].latitud ?? null);
    const lon = typeof longitud !== 'undefined' && longitud !== null && longitud !== '' ? parseFloat(longitud) : (siteCheck.rows[0].longitud ?? null);

    const result = await pool.query(
      `UPDATE sitio SET nombre=$1, categoria=$2, subcategorias=$3, fotos=$4, pet_friendly=$5, kids_friendly=$6, latitud=$7, longitud=$8
       WHERE id_sitio=$9
       RETURNING *`,
      [
        nombre,
        categoria,
        JSON.stringify(subcatsArray),
        newFotos,
        pet,
        kids,
        lat,
        lon,
        id
      ]
    );

    res.json({ message: 'Sitio actualizado', sitio: result.rows[0] });
  } catch (error) {
    console.error('Error en updateSite:', error);
    res.status(500).json({ error: 'No se pudo actualizar el sitio' });
  }
};

// ==========================
// Eliminar sitio
// ==========================
const deleteSite = async (req, res) => {
  try {
    const { id } = req.params;
    const id_usuario = req.user.id;

    const siteCheck = await pool.query('SELECT * FROM sitio WHERE id_sitio=$1 AND id_usuario=$2', [id, id_usuario]);
    if (!siteCheck.rows.length) return res.status(403).json({ error: 'No tienes permiso para eliminar este sitio' });

    await pool.query('DELETE FROM sitio WHERE id_sitio=$1', [id]);
    res.json({ message: 'Sitio eliminado' });
  } catch (error) {
    console.error('Error en deleteSite:', error);
    res.status(500).json({ error: 'No se pudo eliminar el sitio' });
  }
};

// ==========================
// Subir imagen a sitio
// ==========================
const uploadSiteImage = async (req, res) => {
  try {
    const { id } = req.params;
    const id_usuario = req.user.id;

    const siteCheck = await pool.query('SELECT * FROM sitio WHERE id_sitio=$1 AND id_usuario=$2', [id, id_usuario]);
    if (!siteCheck.rows.length) return res.status(403).json({ error: 'No tienes permiso para modificar este sitio' });
    if (!req.file) return res.status(400).json({ error: 'No se subió ninguna imagen' });

    console.log('Subiendo imagen a ImgBB...');
    const imageUrl = await uploadToImgbb(req.file.buffer);
    console.log('Imagen subida con éxito:', imageUrl);

    const existingFotos = siteCheck.rows[0].fotos || [];
    const updatedFotos = [...existingFotos, imageUrl];

    const result = await pool.query(
      'UPDATE sitio SET fotos=$1 WHERE id_sitio=$2 RETURNING *',
      [JSON.stringify(updatedFotos), id]
    );

    res.json({ message: 'Imagen subida con éxito', sitio: result.rows[0] });
  } catch (error) {
    console.error('Error en uploadSiteImage:', error);
    res.status(500).json({ error: 'Error al subir la imagen' });
  }
};

// (exports are declared at the end of the file)

// ==========================
// Listar sitios públicos (con filtros)
// Query params soportados: categoria, pet_friendly, kids_friendly, q (texto de búsqueda)
// ==========================
const getSites = async (req, res) => {
  try {
    const { categoria, pet_friendly, kids_friendly, q } = req.query;

    // Use an aggregated subquery for ratings to avoid grouping all sitio columns
    let baseQuery = `
      SELECT s.*, COALESCE(ar.avg_rating, 0)::float AS avg_rating, COALESCE(ar.reviews_count, 0) AS reviews_count
      FROM sitio s
      LEFT JOIN (
        SELECT id_sitio, AVG(calificacion) AS avg_rating, COUNT(id_resena) AS reviews_count
        FROM resenas
        GROUP BY id_sitio
      ) ar ON ar.id_sitio = s.id_sitio
    `;

    const where = [];
    const params = [];

    if (categoria) {
      params.push(categoria);
      where.push(`s.categoria = $${params.length}`);
    }

    if (typeof pet_friendly !== 'undefined') {
      const val = pet_friendly === 'true' || pet_friendly === '1' || pet_friendly === true;
      params.push(val);
      where.push(`s.pet_friendly = $${params.length}`);
    }

    if (typeof kids_friendly !== 'undefined') {
      const val = kids_friendly === 'true' || kids_friendly === '1' || kids_friendly === true;
      params.push(val);
      where.push(`s.kids_friendly = $${params.length}`);
    }

    if (q) {
      params.push(`%${q}%`);
      where.push(`(s.nombre ILIKE $${params.length} OR s.categoria ILIKE $${params.length} OR s.subcategorias::text ILIKE $${params.length})`);
    }

    let finalQuery = baseQuery;
  if (where.length) finalQuery += ' WHERE ' + where.join(' AND ');
  finalQuery += ' ORDER BY s.id_sitio DESC';

    const result = await pool.query(finalQuery, params);

    // Normalize JSON fields
    const rows = result.rows.map((r) => {
      const out = { ...r };
      try {
        out.subcategorias = typeof out.subcategorias === 'string' ? JSON.parse(out.subcategorias) : out.subcategorias || [];
      } catch (e) {
        out.subcategorias = out.subcategorias || [];
      }
      try {
        out.fotos = typeof out.fotos === 'string' ? JSON.parse(out.fotos) : out.fotos || [];
      } catch (e) {
        out.fotos = out.fotos || [];
      }
      // Normalize lat/long to numbers (or null)
      out.latitud = out.latitud !== null && typeof out.latitud !== 'undefined' && out.latitud !== '' ? parseFloat(out.latitud) : null;
      out.longitud = out.longitud !== null && typeof out.longitud !== 'undefined' && out.longitud !== '' ? parseFloat(out.longitud) : null;
      return out;
    });

    res.json(rows);
  } catch (error) {
    console.error('Error en getSites:', error);
    res.status(500).json({ error: 'Error al listar sitios' });
  }
};


// ==========================
// Obtener sitio por id (público)
// Incluye calificación promedio y contador de reseñas
// ==========================
const getSiteById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT s.*, COALESCE(ar.avg_rating, 0)::float AS avg_rating, COALESCE(ar.reviews_count, 0) AS reviews_count
      FROM sitio s
      LEFT JOIN (
        SELECT id_sitio, AVG(calificacion) AS avg_rating, COUNT(id_resena) AS reviews_count
        FROM resenas
        GROUP BY id_sitio
      ) ar ON ar.id_sitio = s.id_sitio
      WHERE s.id_sitio = $1
    `;

    const result = await pool.query(query, [id]);
    if (!result.rows.length) return res.status(404).json({ message: 'Sitio no encontrado' });

    const row = result.rows[0];
    try {
      row.subcategorias = typeof row.subcategorias === 'string' ? JSON.parse(row.subcategorias) : row.subcategorias || [];
    } catch (e) {
      row.subcategorias = row.subcategorias || [];
    }
    try {
      row.fotos = typeof row.fotos === 'string' ? JSON.parse(row.fotos) : row.fotos || [];
    } catch (e) {
      row.fotos = row.fotos || [];
    }
    row.latitud = row.latitud !== null && typeof row.latitud !== 'undefined' && row.latitud !== '' ? parseFloat(row.latitud) : null;
    row.longitud = row.longitud !== null && typeof row.longitud !== 'undefined' && row.longitud !== '' ? parseFloat(row.longitud) : null;

    res.json(row);
  } catch (error) {
    console.error('Error en getSiteById:', error);
    res.status(500).json({ error: 'Error al obtener sitio' });
  }
};

// Expose new functions
module.exports = {
  createSite,
  getMySites,
  updateSite,
  deleteSite,
  uploadSiteImage,
  getSites,
  getSiteById
};
