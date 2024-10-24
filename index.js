const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const SSLCommerzPayment = require("sslcommerz-lts");
const cookieParser = require("cookie-parser");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;

//middlewares
app.use(
  cors({
    origin: [
      "https://simple-restaurent.web.app",
       "http://localhost:5174",
        "http://localhost:5173"
      ],
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.avz5x.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

//payment section
const store_id = process.env.STORE_ID;
const store_passwd = process.env.STORE_PASS;
const is_live = false; //true for live, false for sandbox

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // console.log("successfully connected to MongoDB!");

    //Database Collections
    const menuCollection = client.db("bistroDB").collection("menu");
    const categoriesCollection = client.db("bistroDB").collection("categories");
    const reviewsCollection = client.db("bistroDB").collection("reviews");
    const usersCollection = client.db("bistroDB").collection("users");
    const cartsCollection = client.db("bistroDB").collection("carts");
    const bookingsCollection = client.db("bistroDB").collection("bookings");
    const ordersCollection = client.db("bistroDB").collection("orders");

    //Middleware Functions

    const VerifyToken = (req, res, next) => {
      // console.log('verify token api hitting')
      const token = req.cookies.token;
      // console.log(token);
      if (!token) {
        return res.status(401).send({ message: "UnAuthorized Access" });
      }
      jwt.verify(token, process.env.PRIVATE_KEY, (err, decoded) => {
        if (err) {
          return res.status(404).send({ message: "Not Found" });
        }
        req.decoded = decoded;
        next();
      });
    };

    const VerifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      if (!email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      // console.log(email, isAdmin, user);
      if (!isAdmin) {
        return res.status(404).send({ message: "Forbidden Access" });
      }
      next();
    };

    // jwt token api
    app.post("/jwt", async (req, res) => {
      // console.log("hitting api jwt", req.body);
      const user = req.body;
      const token = jwt.sign(user, process.env.PRIVATE_KEY, {
        expiresIn: "12h",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: true,
          maxAge: 3600000,
          sameSite: "None",
          path: "/",
        })
        .status(200)
        .send({ message: "cookie set the token" });
    });
    app.get("/menu", async (req, res) => {
      // console.log("api menu hitting")
      const cursor = menuCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });
    app.get("/category", async (req, res) => {
      const cursor = categoriesCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });
    app.get("/reviews", async (req, res) => {
      const cursor = reviewsCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      // console.log("user email", req.body);
      const doc = req.body;
      const query = { email: doc.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({
          message: "Email is already taken",
          insertedId: null,
        });
      }
      const result = await usersCollection.insertOne(doc);
      res.send(result);
    });

    // cart related api
    app.get("/carts", async (req, res) => {
      const userEmail = req.query.email;
      const query = { email: userEmail };
      const result = await cartsCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/carts", async (req, res) => {
      const addToCartData = req.body;
      const result = await cartsCollection.insertOne(addToCartData);
      res.send(result);
    });

    app.delete("/cartItem/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const item = await cartsCollection.find(query).toArray();
      const result = await cartsCollection.deleteOne(query);
      // console.log(id, result, item);
      res.send(result);
    });

    //add review api
    app.post('/review',VerifyToken, async(req, res) =>{
      const {reviewData} = req.body;
      const result = await reviewsCollection.insertOne(reviewData);
      res.status(200).send(result)
    })

    //booking or reservation api
    app.get("/myBookings", async (req, res) => {
      const userEmail = req.query.email;
      // console.log({userEmail})
      const query = { email: userEmail };
      const allBookings = await bookingsCollection.find(query).toArray();
      res.send({ allBookings });
    });
    app.post("/booking", async (req, res) => {
      const Data = req.body.bookingData;
      // console.log({Data})
      const result = await bookingsCollection.insertOne(Data);
      res.send(result);
    });

    app.delete("/booking", async (req, res) => {
      const email = req.query.email;
      const id = req.query.id;
      const query = {
        email: email,
        _id: new ObjectId(id),
      };
      const result = await bookingsCollection.find(query).toArray();

      if (result) {
        const deleteAction = await bookingsCollection.deleteOne(query);
        res.send(deleteAction);
      } else {
        res.status(400).send({ message: "Data is not found" });
      }
    });

    //payment api sslcommerz

    const tran_id = new ObjectId().toString();
    
    // payment api sslcommerz
    app.post("/order", VerifyToken, async (req, res) => {
      const orderInfo = req.body;
      // console.log(orderInfo);
      
      let orderIds = orderInfo.orderIds || [];
      const objectOrderIds = orderIds.map(id => ObjectId.createFromHexString(id));
      // console.log(objectOrderIds);
      
      const products = await menuCollection
        .find({ _id: { $in: objectOrderIds } })
        .toArray();
      
      const totalAmount = products.reduce((acc, currentValue) => {
        return acc + Number(currentValue.price);
      }, 0);
      
      const tran_id = new ObjectId().toString(); // Ensure you have a function to generate a unique tran_id
    
      const data = {
        total_amount: totalAmount,
        currency: orderInfo.currency,
        tran_id: tran_id, 
        success_url: `http://localhost:5000/payment/success/${tran_id}`,
        fail_url: `http://localhost:5000/payment/fail/${tran_id}`,
        cancel_url: "http://localhost:3030/cancel",
        ipn_url: "http://localhost:5000/payment/ipn",
        shipping_method: "Courier",
        product_name: orderInfo.name,
        product_category: "Electronic",
        product_profile: "general",
        cus_name: orderInfo.name,
        cus_email: orderInfo.email,
        cus_add1: orderInfo.address,
        cus_add2: "Dhaka",
        cus_city: orderInfo.city,
        cus_state: orderInfo.region,
        cus_postcode: "1000",
        cus_country: "Bangladesh",
        cus_phone: orderInfo.phone,
        cus_fax: "01711111111",
        ship_name: "Customer Name",
        ship_add1: "Dhaka",
        ship_add2: "Dhaka",
        ship_city: "Dhaka",
        ship_state: "Dhaka",
        ship_postcode: 1000,
        ship_country: "Bangladesh",
      };
    
      try {
        const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
        const apiResponse = await sslcz.init(data);
        
        const GatewayPageURL = apiResponse.GatewayPageURL;
    
        const beforeSuccessPayment = {
          products,
          paidStatus: false,
          tran_id,
          totalAmount,
          email: orderInfo.email,
          name: orderInfo.name,
          phone: orderInfo.phone,
          region: orderInfo.region,
          city: orderInfo.city,
          currency: orderInfo.currency,
          address: orderInfo.address,
          orderIds: orderInfo.orderIds,
          date: orderInfo.date,
        };
        
        await ordersCollection.insertOne(beforeSuccessPayment);
        
        res.status(200).send(GatewayPageURL);
      
    
      } catch (error) {
        console.error("Error during payment initialization:", error);
        res.status(500).send("Internal Server Error");
      }
    });
    
    app.post("/payment/success/:tranId", async (req, res) => {
      const tranId = req.params.tranId;
    
      // Find the order by tran_id to get order details, including orderIds
      const order = await ordersCollection.findOne({ tran_id: tranId });
      
      if (order) {
        await ordersCollection.updateOne(
          { tran_id: tranId },
          { $set: { paidStatus: true } }
        );
    
        const deleteCartItem = await cartsCollection.deleteMany({
          email: order.email, 
          menuId: { $in: order.orderIds } // Use the order's orderIds here
        });
    
        
        
        res.redirect(
          `https://simple-restaurent.web.app/dashboard/payment/success/?tranId=${tranId}&amount=${order.totalAmount}`
        );
      } else {
        console.error("Order not found:", tranId);
        res.status(404).send("Order not found");
      }
    });
    
    app.post("/payment/fail/:tranId", async (req, res) => {
      const tranId = req.params.tranId;

      
      await ordersCollection.updateOne(
        { tran_id: tranId },
        { $set: { paidStatus: false } }
      );
      
      res.redirect(
        `https://simple-restaurent.web.app/dashboard/payment/fail/${tranId}`
      );
    });
    



    //payment-history api
    app.get('/payment-history/:email',VerifyToken, async(req, res) =>{
      const result = await ordersCollection.find({email: req.params.email}).toArray()
      res.status(200).send(result)

    })

    //admin api
    app.get("/users", VerifyToken, VerifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    //set isAdmin dashboard routes.
    app.get("/user/admin/:email", VerifyToken, async (req, res) => {
      // console.log('1 api hitting')
      const userEmail = req.params.email;
      if (userEmail !== req.decoded.email) {
        res.status(200).send({ message: "Access Granted" });
      }
      const query = { email: userEmail };
      const user = await usersCollection.findOne(query);
      if (user?.role === "admin") {
        res.status(200).send({ isAdmin: true });
      } else {
        res.status(200).send({ isAdmin: false });
      }
    });

    app.post("/add-item", async (req, res) => {
      const itemInfo = req.body;
      // console.log(itemInfo)
      const result = await menuCollection.insertOne(itemInfo);
      res.send(result);
    });

    app.get('/menuItem/:id',VerifyToken, VerifyAdmin, async(req, res) =>{
      const query = {_id : new ObjectId(req?.params?.id) }
      const result = await menuCollection.findOne(query);
      // console.log(result)
      res.status(200).send(result)
    })


    app.put("/updateItem/:id", VerifyToken, VerifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const itemInfo = req.body; // Data received from the client
      const updateDoc = { $set: {} }; // This will store the fields to be updated
    
    
    
      if (itemInfo) {
        
        Object.keys(itemInfo).forEach((key) => {
          const value = itemInfo[key];
    
          // Add only non-empty, non-null, non-undefined fields
          if (value !== undefined && value !== null && value !== "") {
            updateDoc.$set[key] = value; // Assign the key-value pair
          }
        });
    
        // If updateDoc has fields to update, perform the update operation
        if (Object.keys(updateDoc.$set).length > 0) {
          try {
            const result = await menuCollection.updateOne(query, updateDoc, { upsert: false });
            return res.status(200).send(result); // Send success response with result
          } catch (error) {
            console.error("Error updating item:", error);
            return res.status(500).send({ message: "Update failed", error });
          }
        }
      }
    
      // If no fields were updated, send this response
      res.status(200).send({ message: "No field was updated" });
    });

    //delete menu item from database
    app.delete('/deleteItem/:id',VerifyToken, VerifyAdmin, async(req, res)=>{
      const result = await menuCollection.deleteOne({_id: new ObjectId(req.params.id) })
      res.status(200).send(result)
    })
    
    //get the booking data from database
    app.get('/bookings', async(req, res) =>{
      const result = await bookingsCollection.find().toArray();
      res.status(200).send(result)
    })

    app.put('/bookings/:id',VerifyToken, VerifyAdmin, async(req, res) =>{
      const result = await bookingsCollection.updateOne(
        {_id: new ObjectId(req.params.id)},
        {$set:{
          activity: true
        }}
      )
      res.status(200).send(result)
    })

    app.patch("/user/admin/:id", async (req, res) => {
      // console.log('2 api hitting')
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.delete("/user/admin/:id", async (req, res) => {
      // console.log('3 api hitting')
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });

    app.post("/logout", async (req, res) => {
      res
        .cookie("token", "", {
          httpOnly: true,
          secure: true,
          expires: new Date(0),
          path: "/",
        })
        .status(200)
        .send("Logout succesfull, access token cleared");
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
  } catch (error) {
    // console.log(error);
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  // console.log(`pothik's server app listening on port ${port}`);
});
