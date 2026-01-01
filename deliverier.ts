import { SoftDeliveryServer } from "./SoftDeliveryServer";

const server = new SoftDeliveryServer({
    hostname: import.meta.env.HOST_ADDRESS || '0.0.0.0',
    port: Number(import.meta.env.HOST_PORT) || 3004 
});

server.run();