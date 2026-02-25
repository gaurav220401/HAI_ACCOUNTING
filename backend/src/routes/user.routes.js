const router = require('express').Router();
const userController = require('../controllers/user.controller');
const { authenticate } = require('../middlewares/auth');

// All user routes require authentication
router.use(authenticate);

router.get('/', userController.list);
router.get('/:id', userController.getById);

module.exports = router;
