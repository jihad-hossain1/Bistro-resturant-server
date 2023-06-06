const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
// const stripe = require("stripe")(process.env.STRIPE_KEY);
const stripe = require("stripe")(
  "sk_test_51NF6zvCz5HvkO88r4io3ym1nBgEMvD8m2ShSMNclDN7KIbULuCKtp6fVYI05r3SQFKI60w0w090RLpwXINIoUWBf00VyjERIz8"
);
const jwt = require("jsonwebtoken");

const cors = require("cors");
require("dotenv").config();

const port = process.env.PORT || 5000;
//token generator
// require('crypto').randomBytes(64).toString('hex')

// Middleware
app.use(cors());
app.use(express.json());
// middleware for verify jwt token
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }
  // bearer token
  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCES_TOKEN, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xd4auwc.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const usersCollection = client.db("bistroRestaurant").collection("users");
    const menuCollection = client.db("bistroRestaurant").collection("menu");
    const reviewCollection = client
      .db("bistroRestaurant")
      .collection("reviews");
    const cartCollection = client.db("bistroRestaurant").collection("carts");
    const paymentCollection = client
      .db("bistroRestaurant")
      .collection("payments");

    //jwt section
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCES_TOKEN, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // warning: use verifyJWT before using verifyAdmin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden message" });
      }
      next();
    };

    // user related apis
    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });
    app.post("/users", async (req, res) => {
      const user = req.body;
      console.log(user);
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });
    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });
    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // menu api
    app.get("/menus", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });
    app.post("/menus", verifyJWT, verifyAdmin, async (req, res) => {
      const newItem = req.body;
      const result = await menuCollection.insertOne(newItem);
      res.send(result);
    });

    // review api

    app.get("/reviews", async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });

    // cart collections api
    app.get("/carts", verifyJWT, async (req, res) => {
      const email = req.query.email;

      if (!email) {
        res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });
    app.post("/carts", async (req, res) => {
      const item = req.body;
      console.log(item);
      const result = await cartCollection.insertOne(item);
      res.send(result);
    });
    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    // create payment intent
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      // const amount = price * 100;
      console.log(price, amount);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // payment related api
    app.post("/payments", verifyJWT, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);

      const query = {
        _id: { $in: payment.cartItems.map((id) => new ObjectId(id)) },
      };
      const deleteResult = await cartCollection.deleteMany(query);

      res.send({ insertResult, deleteResult });
    });
    // admin home collection
    app.get("/admin-stats", verifyJWT, verifyAdmin, async (req, res) => {
      const users = await usersCollection.estimatedDocumentCount();
      const products = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();

      const payments = await paymentCollection.find().toArray();
      const revenue = payments.reduce((sum, payment) => sum + payment.price, 0);
      // console.log(payments);
      // const revenues = payments.map((payment) => payment.payment)
      // const rev = revenues.reduce((sum, payment) => sum + payment.price, 0)
      // console.log(revenue);
      res.send({
        // payments,
        // rev,
        revenue,
        users,
        products,
        orders,
      });
    });

    /**
         * ------------------
         *  Bangla system
         * ------------------
         * 1. load all payments
         * 2. for each payment, get the menuItems array
         * 3. for each item in the menuItems array get the menuItem from the menu collection.
         * 4. put them in an array: allOrderedItems 
         * 5. separate allOrderedItems by category using filter 
         * 6. now get the quantity by using length: pizzas.length
         * 7. for each category use reduce to get the total amount spent on this category
         */
    // api for chart
    app.get('/order-stats', async (req, res) => {
      // const pipeline = [
      //     {
      //         $lookup: {
      //             from: 'menu',
      //             localField: 'menuItems',
      //             foreignField: '_id',
      //             as: 'menuItemsData'
      //         },

      //     },
      //     {
      //         $unwind: '$menuItemsData'
      //     },
      //     {
      //         $group: {
      //             _id: '$menuItemsData.category',
      //             count: { $sum: 1 },
      //             totalPrice: { $sum: 'menuItemsData.price' }
      //         }
      //     }
      // ]
      const pipeline = [
        {
          $lookup: {
            from: 'menu',
            localField: 'menuItems',
            foreignField: '_id',
            as: 'menuItemsData'
          }
        },
        {
          $unwind: '$menuItemsData'
        },
        {
          $group: {
            _id: '$menuItemsData.category',
            count: { $sum: 1 },
            total: { $sum: '$menuItemsData.price' }
          }
        },
        {
          $project: {
            category: '$_id',
            count: 1,
            total: { $round: ['$total', 2] },
            _id: 0
          }
        }
      ];
      const result = await paymentCollection.aggregate(pipeline).toArray()
      res.send(result)
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Bistro Server is Running");
});

app.listen(port, () => {
  console.log(`Bistro Server Run on Port ${port}`);
});

/**
 * --------------------------
 *      NAMING CONVENTION
 * --------------------------
 *
 * user: userCollection
 * app.get('/users')
 * app.get('/users/:id')
 * app.post('/users')
 * app.patch('/users/:id')
 * app.put('/users/:id')
 * app.delete('/users/:id')
 */
