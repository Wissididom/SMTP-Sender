import "dotenv/config";
import { resolveMx } from "node:dns";
import { Socket } from "node:net";
import { randomUUID } from "node:crypto";

let acknowledgedRequest = "";

const getSMTPDate = () => {
  const now = new Date();

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const day = days[now.getDay()];
  const date = String(now.getDate()).padStart(2, "0");
  const month = months[now.getMonth()];
  const year = now.getFullYear();

  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  const timezoneOffsetMinutes = now.getTimezoneOffset();
  const absOffsetMinutes = Math.abs(timezoneOffsetMinutes);
  const offsetHours = String(Math.floor(absOffsetMinutes / 60)).padStart(
    2,
    "0",
  );
  const offsetMinutes = String(absOffsetMinutes % 60).padStart(2, "0");
  const timezoneOffset = `${timezoneOffsetMinutes <= 0 ? "+" : "-"}${offsetHours}${offsetMinutes}`;

  return `${day}, ${date} ${month} ${year} ${hours}:${minutes}:${seconds} ${timezoneOffset}`;
};

async function getMxRecord(domain) {
  return new Promise((resolve, reject) => {
    resolveMx(domain, (err, addresses) => {
      if (err) {
        return reject("Error fetching MX records");
      }
      if (addresses && addresses.length > 0) {
        addresses.sort((a, b) => a.priority - b.priority);
        resolve(addresses[0].exchange);
      } else {
        reject("No MX record found");
      }
    });
  });
}

async function sendMail(
  senderEmail,
  receiverEmail,
  subject,
  body,
  emailDomain,
) {
  const domain = receiverEmail.split("@")[1];
  try {
    const smtpServer = await getMxRecord(domain);
    const client = new Socket();
    client.setNoDelay(true);
    client.on("data", (data) => {
      const strData = data.toString();
      console.log(`Server sent: ${strData}`);
      if (strData.startsWith("220 ")) {
        // service ready
        console.log("Send HELO");
        client.write(`HELO ${emailDomain}\r\n`);
      } else if (strData.startsWith("250 ")) {
        // OK
        switch (acknowledgedRequest) {
          case "": {
            acknowledgedRequest = "HELO";
            console.log("HELO acknowledge!");
            console.log("Send MAIL FROM");
            client.write(`MAIL FROM:<${senderEmail}>\r\n`);
            break;
          }
          case "HELO": {
            acknowledgedRequest = "MAIL FROM";
            console.log("MAIL FROM acknowledge!");
            console.log("Send RCPT TO");
            client.write(`RCPT TO:<${receiverEmail}>\r\n`);
            break;
          }
          case "MAIL FROM": {
            acknowledgedRequest = "RCPT TO";
            console.log("RCPT TO acknowledge!");
            console.log("Send DATA");
            client.write(`DATA\r\n`);
            break;
          }
          case "RCPT TO": {
            acknowledgedRequest = "QUIT";
            console.log("QUIT acknowledge!");
            console.log("Send QUIT");
            client.write(`QUIT\r\n`);
            break;
          }
          default: {
            console.log(
              `Switch case default (${acknowledgedRequest}), I don't know what to do`,
            );
          }
        }
      } else if (strData.startsWith("354 ")) {
        // start mail input
        console.log("Send body");
        client.write(
          `From: <${senderEmail}>\r\nTo: <${receiverEmail}>\r\nSubject: ${subject}\r\nDate: ${getSMTPDate()}\r\nMessage-ID: <${randomUUID()}@${emailDomain}>\r\n\r\n${body}\r\n.\r\n`,
        );
      } else if (strData.startsWith("221 ")) {
        // closing channel
        console.log("Server announced closing of the connection");
      } else {
        console.log("Received: " + strData);
      }
    });
    client.on("close", (hadError) => {
      console.log("Connection closed");
      if (hadError) {
        console.log("Failed to send Email!");
      } else {
        console.log("Email successfully sent!");
      }
    });
    client.connect(25, smtpServer, () => {
      console.log("Connected to SMTP Server");
    });
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

await sendMail(
  process.env.SENDER_EMAIL,
  process.env.RECEIVER_EMAIL,
  process.env.EMAIL_SUBJECT,
  process.env.EMAIL_BODY,
  process.env.EMAIL_DOMAIN,
);
