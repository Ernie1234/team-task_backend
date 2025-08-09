import winston from "winston";
import chalk from "chalk"; // Import chalk

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const level = () => {
  const env = process.env.NODE_ENV || "development";
  const isDevelopment = env === "development";
  return isDevelopment ? "debug" : "warn";
};

// Define colors using chalk directly for use in printf
// const colors = {
//   error: chalk.red.bold,
//   warn: chalk.yellow,
//   info: chalk.green,
//   http: chalk.blue,
//   debug: chalk.gray,
// };

const colors = {
  error: chalk.hex("#FF6961"), // A pastel red
  warn: chalk.hex("#FDFD96"), // A pastel yellow
  info: chalk.hex("#77DD77"), // A pastel green
  http: chalk.hex("#84B6F4"), // A pastel blue
  debug: chalk.hex("#CBC3E3"), // A pastel purple
};

// const colors = {
//   error: chalk.red.bold,
//   warn: chalk.yellow.bold,
//   info: chalk.cyan.bold,
//   http: chalk.magenta.bold,
//   debug: chalk.white.bold,
// };

// const colors = {
//   error: chalk.bgRed.white, // Using chalk's methods
//   warn: chalk.bgYellow.black,
//   info: chalk.bgGreen.black,
//   http: chalk.bgMagenta.white,
//   debug: chalk.bgWhite.black,
// };

// winston.addColors(colors); // No longer strictly necessary if using chalk directly in printf

const format = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss:ms" }),
  // Remove winston.format.colorize({ all: true }) if you want full control with chalk
  // If you keep it, winston.addColors(colors) should work, but the error suggests otherwise.
  // For problematic cases, it's safer to colorize manually in printf.
  winston.format.printf((info) => {
    const message = `${info.timestamp} ${info.level}: ${info.message}`;
    switch (info.level) {
      case "error":
        return colors.error(message);
      case "warn":
        return colors.warn(message);
      case "info":
        return colors.info(message);
      case "http":
        return colors.http(message);
      case "debug":
        return colors.debug(message);
      default:
        return message;
    }
  })
);

const transports = [
  new winston.transports.Console(),
  new winston.transports.File({
    filename: "logs/error.log",
    level: "error",
  }),
  new winston.transports.File({ filename: "logs/all.log" }),
];

const Logger = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
});

export default Logger;
