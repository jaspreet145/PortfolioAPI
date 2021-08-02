const express = require('express');
const mongoose = require('mongoose');
const morgan = require('morgan');
const cors = require('cors');
require('dotenv').config();

//routers
const tradeRouter = require('./routes/trades')

const port = process.env.PORT || 3000;
const app = express();

app.use(cors())
app.use(express.json())

app.use(morgan(':method :url :status :res[content-length] - :response-time ms'))

const uri = process.env.ATLAS_URI;

mongoose.connect(uri, {
    useNewUrlParser: true,
    useCreateIndex: true,
    useUnifiedTopology: true,
  });

mongoose.connection.once('open',()=>{
    console.log('connected');
})

app.use('/trade',tradeRouter);

app.listen(port , console.log(`application listening on port ${port}`))
