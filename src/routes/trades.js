const mongoose = require("mongoose");
const router = require("express").Router();
const portfolio = require("../models/portfolio.model");
const trades = require("../models/trades.model");
const { param } = require("express-validator");
const { tradeSchema } = require("../schema/tradeSchema");
const validateRequestSchema = require("../validator");

/*
  makes a new Trade(Buy/Sell)
  creates security if Buy with non-existence TickerSymbol
*/
router.use("/newTrade", tradeSchema, validateRequestSchema);
router.route("/newTrade").post(async (req, res) => {
  let { tickerSymbol, type, shares, price } = req.body;
  let averageBuyPrice = price;
  const doc = await portfolio.findOne({ tickerSymbol }).exec();
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    //new security
    if (!doc) {
      if (type == "Buy") {
        const securityId = (await portfolio.countDocuments().exec()) + 1;
        const id = (await trades.countDocuments().exec()) + 1;
        const trade = new trades({
          id,
          price,
          shares,
          type,
          securityId,
        });
        const security = new portfolio({
          securityId,
          tickerSymbol,
          shares,
          averageBuyPrice,
          trades: [trade._id],
        });

        await security.save({ session });
        await trade.save(session);
      } else {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(400)
          .send({ message: "Security with this ticker symbol does't exist" });
      }
    } else {
      //buy or sell on existing ticker
      if (type == "Sell") {
        let newShares = doc.shares - shares;
        const securityId = doc.securityId;
        const id = (await trades.countDocuments().exec()) + 1;
        const trade = new trades({
          id,
          price,
          shares,
          type,
          securityId,
        });
        if (newShares < 0) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).send({
            message: "unsufficient shares to sell",
          });
        }
        await portfolio.updateOne(
          { _id: doc._id },
          {
            shares: newShares,
            trades: [...doc.trades, trade._id],
          },
          { session }
        );
        await trade.save({ session });
      } else {
        averageBuyPrice =
          (doc.averageBuyPrice * doc.shares + price * shares) /
          (doc.shares + shares);
        let newShares = doc.shares + shares;
        const securityId = doc.securityId;
        const id = (await trades.countDocuments().exec()) + 1;
        const trade = new trades({
          id,
          price,
          shares,
          type,
          securityId,
        });
        await portfolio.updateOne(
          { _id: doc._id },
          {
            averageBuyPrice,
            shares: newShares,
            trades: [...doc.trades, trade._id],
          },
          { session }
        );
        await trade.save({ session });
      }
    }
    await session.commitTransaction();
    session.endSession();
    return res.status(201).send({ message : "trade successful"});
  } catch {
    await session.abortTransaction();
    session.endSession();
    return res.status(400).send({
      message: "something went wrong while performing this trade",
    });
  }
});

/*
  fetches all the securities and trades corresponding
  to it.
*/
router.route("/fetchTrades").get(async (req, res) => {
  portfolio
    .find()
    .populate("trades")
    .then((docs) => {
      return res.status(200).json(docs);
    })
    .catch(() => {
      return res.status(400).send({
        message: "something went wrong while fetching trades",
      });
    });
});

/*
  Fetches portfolio
*/
router.route("/fetchPortfolio").get(async (req, res) => {
  portfolio
    .find({}, "securityId tickerSymbol shares averageBuyPrice")
    .then((docs) => {
      res.status(200).json(docs);
    })
    .catch(() => {
      return res.status(400).send({
        message: "something went wrong while fetching portfolio",
      });
    });
});

/*
  update a previously made trade
*/

router.use(
  "/updateTrade/:id",
  [
    ...tradeSchema,
    param("id").isNumeric().withMessage("id should be numeric").toInt(),
  ],
  validateRequestSchema
);
router.route("/updateTrade/:id").patch(async (req, res) => {
  let {
    tickerSymbol: newTickerSymbol,
    price: newPrice,
    shares: newShares,
    type: newType,
  } = req.body;
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const id = req.params.id;
    const trade = await trades.findOne({ id }).exec();
    if (!trade) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).send({ message: "trade doesn't exist" });
    }
    const security = await portfolio
      .findOne({ securityId: trade.securityId })
      .exec();
    //change in same security and trade type is same as well
    if (newType == trade.type && newTickerSymbol == security.tickerSymbol) {
      if (trade.type == "Sell") {
        let difference = newShares - trade.shares;
        if (difference == 0) {
          await session.abortTransaction();
          session.endSession();
          return res
            .status(400)
            .send({ message: "same number of shares in trade as before" });
        } else if (difference > 0) {
          //sell more
          let remainingShare = security.shares - difference;
          if (remainingShare < 0) {
            await session.abortTransaction();
            session.endSession();
            return res
              .status(400)
              .send({ message: "unsufficient shares to sell" });
          }
          await trades.updateOne(
            { id },
            { shares: newShares, price: newPrice },
            { session }
          );
          await portfolio.updateOne(
            { securityId: trade.securityId },
            {
              shares: remainingShare,
            },
            { session }
          );

          await session.commitTransaction();
          session.endSession();
          return res.status(200).send({
            message: "update successful",
          });
        } else {
          let newChanges = revertTrade(trade, security);
          delete newChanges.trades;
          let remainingShare = security.shares - newShares;
          if (remainingShare < 0) {
            await session.abortTransaction();
            session.endSession();
            return res
              .status(400)
              .send({ message: "unsufficient shares to sell" });
          }
          newChanges.shares = remainingShare;
          await portfolio.updateOne(
            { securityId: security.securityId },
            newChanges,
            { session }
          );
          await trades.updateOne(
            { id },
            { shares: newShares, price: newPrice },
            { session }
          );

          await session.commitTransaction();
          session.endSession();
          return res.status(200).send({
            message: "update successful",
          });
        }
      } //BUY with same price and newshares>trade.shares (which means buy more shares)
      else if (newPrice == trade.price && trade.shares - newShares < 0) {
        let difference = trade.shares - newShares;
        difference = Math.abs(difference);
        let shares = security.shares + difference;
        let averageBuyPrice =
          (security.averageBuyPrice * security.shares +
            trade.price * difference) /
          shares;
        await trades.updateOne(
          { id },
          { shares: newShares, price: newPrice },
          { session }
        );
        await portfolio.updateOne(
          { securityId: trade.securityId },
          {
            shares,
            averageBuyPrice,
          },
          { session }
        );

        await session.commitTransaction();
        session.endSession();
        return res.status(200).send({
          message: "update successful",
        });
      } //revert previous Buy and Buy New if newshares<trade.shares
      else {
        let newChanges = revertTrade(trade, security);
        if (newChanges == -1) {
          await session.abortTransaction();
          session.endSession();
          return res
            .status(400)
            .send({ message: "Unsufficient Security shares" });
        }
        delete newChanges.trades;
        newChanges.averageBuyPrice =
          (newChanges.averageBuyPrice * newChanges.shares +
            newPrice * newShares) /
          (newChanges.shares + newShares);
        newChanges.shares = newChanges.shares + newShares;
        await trades.updateOne(
          { id },
          { shares: newShares, price: newPrice },
          { session }
        );
        await portfolio.updateOne(
          { securityId: trade.securityId },
          newChanges,
          { session }
        );
        await session.commitTransaction();
        session.endSession();
        return res.status(200).send({
          message: "update successful",
        });
      }
    } //trade type is changed revert previous change and perform new trade
    else {
      let newChanges = revertTrade(trade, security);
      if (newChanges == -1) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(400)
          .send({ message: "Unsufficient Security shares" });
      }
      let newSecurity = await portfolio
        .findOne({ tickerSymbol: newTickerSymbol })
        .exec();
      if (!newSecurity) {
        // security doesn't exist
        const securityId = (await portfolio.countDocuments().exec()) + 1;
        newSecurity = new portfolio({
          securityId,
          tickerSymbol: newTickerSymbol,
          shares: newShares,
          averageBuyPrice: newPrice,
          trades: [trade._id],
        });
        await newSecurity.save({ session });
        await trades.updateOne(
          { id },
          {
            price: newPrice,
            shares: newShares,
            type: newType,
            securityId,
          },
          { session }
        );
        await portfolio.updateOne({ securityId: security.securityId }, newChanges, {
          session,
        });

        await session.commitTransaction();
        session.endSession();
        return res.status(200).send({ message: "trade has been updated" });
      } else {
        await trades.updateOne(
          { id },
          {
            type: newType,
            shares: newShares,
            price: newPrice,
            securityId: newSecurity.securityId,
          },
          { session }
        );
        await portfolio.updateOne(
          { securityId: security.securityId },
          newChanges,
          { session }
        );
        newSecurity = await portfolio.findOne(
          { tickerSymbol: newTickerSymbol },
          "",
          { session }
        );
        let newaverageBuyPrice;
        if (newType == "Buy") {
          newaverageBuyPrice =
            (newSecurity.averageBuyPrice * newSecurity.shares +
              newPrice * newShares) /
            (newSecurity.shares + newShares);
          newShares = newChanges.shares + newShares;
        } else {
          newShares = newSecurity.shares - newShares;
          newaverageBuyPrice = newSecurity.averageBuyPrice;
        }
        if (newShares < 0) {
          await session.abortTransaction();
          session.endSession();
          return res
            .status(400)
            .send({ message: "unsufficient security shares" });
        }

        await portfolio.updateOne(
          { securityId: newSecurity.securityId },
          {
            averageBuyPrice: newaverageBuyPrice,
            shares: newShares,
            trades: [trade._id],
          },
          { session }
        );

        await session.commitTransaction();
        session.endSession();
        return res.status(200).send({ message: "trade has been updated" });
      }
    }
  } catch {
    await session.abortTransaction();
    session.endSession();
    res.status(400).send({
      message: "something went wrong while updating this trade",
    });
  }
});

/* reverts a trade and return change in security after reverting */
function revertTrade(trade, security) {
  let trades = security.trades.filter((ele) => ele.toString() != trade._id.toString());
  if (trade.type == "Sell") {
    const newShare = security.shares + trade.shares;
    return {
      shares: newShare,
      averageBuyPrice: security.averageBuyPrice,
      trades,
    };
  } else {
    const newShare = security.shares - trade.shares;
    if (newShare <= 0) return -1; //shares negative
    const averageBuyPrice =
      (security.averageBuyPrice * security.shares -
        trade.price * trade.shares) /
      newShare;
    return { shares: newShare, averageBuyPrice, trades };
  }
}

/*
  reverts a trade
*/
router.route("/revertTrade/:id").patch(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const id = req.params.id;
    const trade = await trades.findOne({ id }).exec();
    const security = await portfolio
      .findOne({ securityId: trade.securityId })
      .exec();
    const newChanges = revertTrade(trade, security);
    if (newChanges == -1) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).send({
        message: "this trade cannot be reverted",
      });
    }

    await portfolio.updateOne({ securityId: trade.securityId }, newChanges, {
      session,
    });
    await trades.deleteOne({ id }, { session });
    await session.commitTransaction();
    session.endSession();
    return res.status(200).send({
      message: "trade has been reverted successfully",
    });
  } catch {
    await session.abortTransaction();
    session.endSession();
    return res.status(400).send({
      message: "something went wrong while reverting this trade",
    });
  }
});

/* gives return */
router.route("/fetchReturn").get(async (req, res) => {
  portfolio
    .find({}, "securityId tickerSymbol shares averageBuyPrice")
    .then((docs) => {
      let returns = 0;
      for (let doc of docs) returns += (100 - doc.averageBuyPrice) * doc.shares;
      return res.status(200).send({ returns: `Rs. ${returns}` });
    })
    .catch(() => {
      return res.status(400).send({
        message: "something went wrong while fetching returns",
      });
    });
});

module.exports = router;
