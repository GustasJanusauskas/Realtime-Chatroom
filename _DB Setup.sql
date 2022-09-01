CREATE DATABASE chatdb;
\c chatdb;

CREATE TABLE users(
	usr_id bigserial UNIQUE NOT NULL,
	username varchar(64) UNIQUE NOT NULL,
	password varchar(128) NOT NULL,
	email varchar(256) UNIQUE NOT NULL,
	created timestamp,
	salt varchar(8),
	pepper varchar(8),
	PRIMARY KEY(usr_id)
);

CREATE TABLE messages(
	msg_id bigserial UNIQUE NOT NULL,
	msg varchar(300) NOT NULL,
	usr varchar(32) NOT NULL,
	room varchar(64) NOT NULL,
	date timestamp,
	ip varchar(32),
	file varchar(128),
	PRIMARY KEY(msg_id)
);