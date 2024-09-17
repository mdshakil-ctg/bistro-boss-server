const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser')
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

//middlewares
app.use(cors({
  origin: ['http://localhost:5173'], 
  credentials: true 
}));
app.use(express.json());
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.avz5x.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});



async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  
    //Database Collections
const menuCollection = client.db('bistroDB').collection('menu');
const categoriesCollection = client.db('bistroDB').collection('categories');
const reviewsCollection = client.db('bistroDB').collection('reviews');
const usersCollection = client.db('bistroDB').collection('users');
const cartsCollection = client.db('bistroDB').collection('carts');

//Middleware Functions

const VerifyToken = (req, res, next) =>{
  const token = req.cookies.token;
  if(!token){
   return res.status(401).send({message: 'UnAuthorized Access'})
  }
  jwt.verify(token, process.env.PRIVATE_KEY, (err, decoded) =>{
    if(err){
      return res.status(401).send({message: 'Unauthorized Access'})
    }
    req.decoded = decoded;
    next()
  })
}

const VerifyAdmin = async(req, res, next) =>{
  const email = req.decoded.email;
  if(!email){
    return  res.status(403).send({message: "Forbidden Access"})
  }
  const query = {email: email}
  const user = await usersCollection.findOne(query);
  const isAdmin = user?.role === 'admin';
  console.log(email, isAdmin, user);
  if(!isAdmin){
    return  res.status(403).send({message: "Forbidden Access"})
  }
  next()
}

    // jwt token api
    app.post('/jwt', async(req, res) =>{
      console.log('hitting api jwt',req.body);
      const user = req.body;
      const token = jwt.sign(user, process.env.PRIVATE_KEY, {expiresIn: '12h'});
      res.cookie('token', token, {
        httpOnly: true,
        secure: true,
        maxAge: 3600000,
        sameSite: 'None',
        path: '/', 
      })
      .status(200)
      .send({message: 'cookie set the token'})
    })
    app.get('/menu', async(req, res) =>{
      const cursor =  menuCollection.find();
      const result = await cursor.toArray();
      res.send(result); 
    })
    app.get('/category', async(req, res) =>{
      const cursor =  categoriesCollection.find();
      const result = await cursor.toArray();
      res.send(result); 
    })
    app.get('/reviews', async(req, res) =>{
      const cursor =  reviewsCollection.find();
      const result = await cursor.toArray();
      res.send(result); 
    });

    app.post('/users', async(req, res)=>{
      console.log('user email',req.body)
      const doc = req.body;
      const query = {email: doc.email};
      const existingUser = await usersCollection.findOne(query);
      if(existingUser){
        return res.send({message: 'Email is already taken', insertedId: null})
      }
      const result = await usersCollection.insertOne(doc);
      res.send(result);
    });

    // cart related api
    app.get('/carts', async(req, res) =>{
      const userEmail = req.query.email;
      const query = {email: userEmail}
      const result = await cartsCollection.find(query).toArray()
      res.send(result);
    })

    app.post('/carts', async(req, res) =>{
          const addToCartData = req.body;
      const result = await cartsCollection.insertOne(addToCartData)
      res.send(result)

    })

    app.delete('/cartItem/:id', async(req,res) =>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await cartsCollection.deleteOne(query);
      res.send(result)
    })

    //admin api
    app.get('/users',VerifyToken, VerifyAdmin, async(req, res) =>{
      const result = await usersCollection.find().toArray()
      res.send(result);
    })

    app.get('/user/admin/:email', async(req, res) =>{
      const email = req.params.email
      console.log('hiting email',email);
      res.send({isAdmin: true})
    })

    app.post('/add-item',async(req, res) =>{
      const itemInfo = req.body;
      const result = await menuCollection.insertOne(itemInfo)
      res.send(result)
    })
    //line added for demo
    app.post('/update-item',async(req, res) =>{
      const itemInfo = req.body;
      const result = await menuCollection.updateOne(itemInfo)
      res.send(result)
    })

    app.patch('/user/admin/:id', async(req, res) =>{
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const updatedDoc = {
        $set:{
          role: 'admin'
        }
      };
      const result = await usersCollection.updateOne(filter, updatedDoc)
      res.send(result);
    })

    app.delete('/user/admin/:id', async(req, res) =>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await usersCollection.deleteOne(query);
      res.send(result)
    })

    app.post('/logout', async(req, res) =>{
      res.cookie('token', '', {
        httpOnly: true,
        secure: true,
        expires: new Date(0),
        path: '/'
      })
      .status(200)
      .send('Logout succesfull, access token cleared')
    })

    

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
 
  res.send('Hello World!')
})


app.listen(port, () => {
  console.log(`coffee server app listening on port ${port}`)
})