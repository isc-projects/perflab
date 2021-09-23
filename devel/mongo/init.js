rs.initiate()
db.createCollection('log', {capped: true, size: 32768})
