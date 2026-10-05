import webpush from "web-push";
const keys = webpush.generateVAPIDKeys();
console.log(
  `VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nVAPID_SUBJECT=mailto:admin@example.com`,
);
