const mongoose = require('mongoose')
const Schema  = mongoose.Schema;

const portfolioSchema = new Schema({
    securityId:{
        type: Number,
        required: true,
    },
    tickerSymbol:{
        type: String,
        required: true,
        unique: true 
    },
    averageBuyPrice:{
        type: Number,
        required:true,
        min: 0
    },
    shares:{
        type: Number,
        required: true,
        min: 0
    },
    trades:[{ type: Schema.Types.ObjectId, ref: 'trades' }]
});
portfolioSchema.set('collection', 'portfolio');
const portfolio = mongoose.model("portfolio", portfolioSchema);

module.exports = portfolio;