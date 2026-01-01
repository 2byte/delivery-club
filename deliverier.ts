import { SoftDeliveryServer } from "./SoftDeliveryServer";

const server = new SoftDeliveryServer({ port: Number(import.meta.env.HOST_PORT) || 3004 });

server.run();