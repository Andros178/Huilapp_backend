const express = require('express');
const router = express.Router();
const siteController = require('../controllers/sitesController');
const authenticateToken = require('../middleware/authenticateToken');

router.post('/', authenticateToken, siteController.createSite);
router.get('/my-sites', authenticateToken, siteController.getMySites);
router.put('/:id', authenticateToken, siteController.updateSite);
router.delete('/:id', authenticateToken, siteController.deleteSite);

module.exports = router;
