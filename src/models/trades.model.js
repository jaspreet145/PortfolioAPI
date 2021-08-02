const mongoose = require('mongoose')
const Schema  = mongoose.Schema;

const tradeSchema = new Schema({
    id:{
        type:Number,
        required: true,
    },
    securityId:{
        type: Number,
        required: true
    },
    type:{
        type: String,
        enum : ['Buy','Sell'],
        required: true,
    },
    price:{
        type: Number,
        required: true,
        min: 1
    },
    shares:{
        type: Number,
        required: true,
        min: 1
    }
});
tradeSchema.set('collection', 'trades');
const trades = mongoose.model("trades", tradeSchema);

module.exports = trades;