const express = require('express');
const router = express.Router();
const resenasController = require('../controllers/resenasController');
const authenticateToken = require('../middleware/authenticateToken');



router.post('/', authenticateToken, resenasController.createResena);


router.get('/sitio/:id_sitio', resenasController.getResenasBySitio);


router.put('/:id_resena', authenticateToken, resenasController.updateResena);

router.delete('/:id_resena', authenticateToken, resenasController.deleteResena);

module.exports = router;
