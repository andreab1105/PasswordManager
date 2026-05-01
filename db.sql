CREATE SCHEMA IF NOT EXISTS PASSWD;
USE PASSWD;

-- UTENTI must be created first (referenced by PASSWORD table)
CREATE TABLE UTENTI
(
    nome VARCHAR(50) NOT NULL PRIMARY KEY,
    password_hash VARCHAR (255) NOT NULL,
    salt VARCHAR (50) NOT NULL 
);

CREATE TABLE PASSWORD
(
	id INT AUTO_INCREMENT PRIMARY KEY,
    utente VARCHAR (30),
    indirizzo_url VARCHAR (100),
    username VARCHAR (50) ,
    password_cifrata VARCHAR (200) NOT NULL ,
    FOREIGN KEY (utente) REFERENCES UTENTI(nome)
);

