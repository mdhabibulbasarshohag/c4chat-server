const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "http://localhost:5173" } });

app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => console.log("MongoDB Connected"))
    .catch(err => console.log(err));

// ✅ Message Schema
const MessageSchema = new mongoose.Schema({
    sender: String,
    receiver: String,
    message: String,
    timestamp: { type: Date, default: Date.now },
    status: { type: String, default: "sent" }
});
const Message = mongoose.model("Message", MessageSchema);

// ✅ Friend Request Schema
const FriendRequestSchema = new mongoose.Schema({
    senderEmail: String,
    receiverEmail: String,
    status: { type: String, default: "pending" }
});
const FriendRequest = mongoose.model("FriendRequest", FriendRequestSchema);

// ✅ Friend List Schema
const FriendSchema = new mongoose.Schema({
    userEmail: String,
    friendEmail: String
});
const Friend = mongoose.model("Friend", FriendSchema);

// ✅ Fetch Messages between Two Users
app.get("/messages", async (req, res) => {
    const { sender, receiver } = req.query;
    try {
        const messages = await Message.find({
            $or: [
                { sender, receiver },
                { sender: receiver, receiver: sender }
            ]
        }).sort({ timestamp: 1 });

        res.json(messages);
    } catch (error) {
        console.error(error);
        res.status(500).send("Error fetching messages.");
    }
});

// ✅ Send Friend Request
app.post("/sendFriendRequest", async (req, res) => {
    const { senderEmail, receiverEmail } = req.body;
    if (senderEmail === receiverEmail) return res.status(400).send("Cannot add yourself as a friend.");

    const existingRequest = await FriendRequest.findOne({ senderEmail, receiverEmail });
    if (existingRequest) return res.status(400).send("Friend request already sent.");

    await new FriendRequest({ senderEmail, receiverEmail }).save();
    res.send("Friend request sent.");
});

// ✅ Fetch Friend Requests
app.get("/friendRequests/:email", async (req, res) => {
    const requests = await FriendRequest.find({ receiverEmail: req.params.email, status: "pending" });
    res.json(requests);
});

// ✅ Accept Friend Request
app.post("/acceptFriendRequest", async (req, res) => {
    const { userEmail, friendEmail } = req.body;

    const request = await FriendRequest.findOne({ senderEmail: friendEmail, receiverEmail: userEmail, status: "pending" });
    if (!request) return res.status(400).send("Friend request not found.");

    await FriendRequest.updateOne({ _id: request._id }, { status: "accepted" });
    await new Friend({ userEmail, friendEmail }).save();
    await new Friend({ userEmail: friendEmail, friendEmail: userEmail }).save();

    res.send("Friend request accepted.");
});

// ✅ Fetch Friend List
app.get("/friends/:email", async (req, res) => {
    const friends = await Friend.find({ userEmail: req.params.email });
    res.json(friends);
});

// ✅ WebSocket Chat Handling
io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("sendMessage", async (data) => {
        const newMessage = new Message(data);
        await newMessage.save();
        io.emit("receiveMessage", newMessage);
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
    });
});

// ✅ Start Server
server.listen(5001, () => console.log("Server running on port 5001"));