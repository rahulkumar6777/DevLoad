import { app, server } from "./index.js";
import cors from 'cors'
import { corsFrontend, corsPublic } from "./src/utils/frontendCors.js";
import { packageCors } from "./src/utils/packageCors.js";
import { monitoringMiddleware } from "./src/middleware/monitering.middleware.js";
import { privateCors } from "./src/utils/cors.js";


// here i import the router paths  
import userRoutes from './src/routes/user.routes.js'
import publicUrlRoutes from './src/routes/publicUrl.routes.js'
import packageRoutes from './src/routes/package.routes.js'
import privateRoutes from "./src/routes/private.routes.js";


// routes here
app.use('/public', cors(corsPublic), publicUrlRoutes)
app.use('/api/v2/user', cors(corsFrontend), monitoringMiddleware, userRoutes)
app.use('/api/v1/devload', cors(packageCors), packageRoutes)
app.use('/api/v1/private', cors(privateCors), privateRoutes)

// worker
import './src/worker/index.js'


server.listen(process.env.PORT, "0.0.0.0", () => {
    console.log(`server is running on http://localhost:${process.env.PORT}`)
});
