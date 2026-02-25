module.exports = (err, req, res, next) => {
  console.error(err);

  const status = err.status || 500;
  const message = err.message || 'Something went wrong';

  res.status(status).json({ message });
};
