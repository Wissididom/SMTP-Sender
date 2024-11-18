import 'dotenv/config';
import { resolveMx } from "node:dns";
import { Socket } from "node:net";

async function getMxRecord(domain) {
    return new Promise((resolve, reject) => {
        resolveMx(domain, (err, addresses) => {
            if (err) {
                return reject('Error fetching MX records');
            }
            if (addresses && addresses.length > 0) {
                addresses.sort((a, b) => a.priority - b.priority);
                resolve(addresses[0].exchange);
            } else {
                reject('No MX record found');
            }
        });
    });
}

async function sendMail(senderEmail, receiverEmail, subject, body, emailDomain) {
    const domain = receiverEmail.split('@')[1];
    try {
        const smtpServer = await getMxRecord(domain);
        /*const transporter = nodemailer.createTransport({
            host: smtpServer,
            port: 25,
            secure: false // Can maybe later use STARTTLS
        });
        const mailOptions = {
            from: senderEmail,
            to: receiverEmail,
            subject: subject,
            text: body
        };*/
        const client = new Socket();
        client.setNoDelay(true);
        client.on('data', (data) => {
            const strData = data.toString();
            console.log('Received: ' + strData);
            if (strData.startsWith(`220 ${smtpServer}`)) {
                client.write(`HELO ${emailDomain}`);
            }
            client.destroy(); // Just for testing purposes
        });
        client.on('close', (hadError) => {
            console.log('Connection closed');
            if (hadError) {
                console.log('Failed to send Email!');
            } else {
                console.log('Email successfully sent!');
            }
        });
        client.connect(25, smtpServer, () => {
            console.log('Connected to SMTP Server');
        });
    } catch (error) {
        console.error('Error sending email:', error);
    }
}

await sendMail(process.env.SENDER_EMAIL, process.env.RECEIVER_EMAIL, process.env.EMAIL_SUBJECT, process.env.EMAIL_BODY, process.env.EMAIL_DOMAIN);
