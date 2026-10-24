import mongoose from "mongoose";

const connectDB = async () => {
  const uri = process.env.MONGO_URL || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/jivexa_auth";

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000, // fail fast instead of hanging ~30s
      maxPoolSize: 10,                // keep a warm pool of connections
      minPoolSize: 2
    });
    console.log("[MongoDB Connected]");
  } catch (err) {
    console.error("[MongoDB Fatal]: Could not connect:", err.message);
    throw err;
  }
};

export default connectDB;