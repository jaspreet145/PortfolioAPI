const { body } = require('express-validator');

const schema = [
  body('tickerSymbol').exists().withMessage('tickerSymbol is required').trim().isUppercase().withMessage("tickerSymbol should be in uppercase"),
  body('price').exists().withMessage('price is required').isFloat({min:1}).withMessage("price should be greater than 1").toFloat(),
  body('shares').exists().withMessage("shares is required").isFloat({min:1}).toFloat().withMessage("shares should be greater than 1"),
  body('type').exists().withMessage("type is required").trim().isIn(['Buy', 'Sell']).withMessage("type should be in [Buy,Sell]")
];

module.exports =  { tradeSchema : schema };