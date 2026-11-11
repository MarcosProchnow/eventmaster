import nodemailer, { type Transporter } from "nodemailer";
import type { Mailer } from "../application/ports.ts";

/** Adaptador SMTP. Em desenvolvimento aponta para o Mailpit, que só captura os e-mails. */
export class SmtpMailer implements Mailer {
  readonly #transport: Transporter;
  readonly #from: string;

  constructor(smtpUrl: string, from: string) {
    this.#transport = nodemailer.createTransport(smtpUrl);
    this.#from = from;
  }

  async send(message: { to: string; subject: string; text: string }): Promise<void> {
    await this.#transport.sendMail({ from: this.#from, ...message });
  }

  close(): void {
    this.#transport.close();
  }
}
