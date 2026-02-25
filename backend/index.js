import express from "express";
import http from "http";
import { Server} from "socket.io";
import { corsFrontend } from "./src/utils/frontendCors.js";


// dotenv configuration
import { configDotenv } from "dotenv";
configDotenv();


// // run container befroe server start
// import { runcontainer } from "./src/scripts/index.js";
// await runcontainer()


//database connection
import { connectDb } from "./src/configs/db.connect.js";
await connectDb();


// make a express app
const app = express();


// make server for socket.io
const server = http.createServer(app);
const io = new Server(server , {
    cors: corsFrontend
})


// connection on socket
io.on("connection" , (socket) => {
    console.log("user connected")

    socket.on("disconnect" , async () => {
        console.log('user disconnected')
    })
})


// middleware of express parsing
app.use(express.json());
app.use(express.urlencoded({extended: true}));


// important security middlewares import path
import hpp from "hpp";
import helmet from "helmet";
import { xssSanitizeRequest } from "./src/middleware/xssSanitizeMiddleware.js";
import { sanitizeRequest } from "./src/middleware/sanitizeMiddleware.js";


// uses on security middlewares
app.use(hpp())
app.use(helmet({
    contentSecurityPolicy: false,
}))
app.use(xssSanitizeRequest)
app.use(sanitizeRequest)


// logging middleware
// import morgan from "morgan";
// app.use(morgan("combined"));


// cookie parser middleware
import cookieParser from "cookie-parser";
app.use(cookieParser());


// compression middleware
import compression from "compression";
app.use(compression());




// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal Server Error" });
});




export { app , server , io}