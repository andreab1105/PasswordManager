package database

import (
	"database/sql"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
	"unicode"

	"crypto/aes"    //
	"crypto/cipher" // cifratura
	"crypto/rand"   //

	"encoding/base64" // encoding per il salt della chiave

	// chiave di cifratura

	_ "github.com/go-sql-driver/mysql"

	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/bcrypt" //hash
)

func Prova() string {
	var ciao = "ciao dal db"
	return ciao

}

func Connection() (*sql.DB, error) {
	// Carica il file .env
	/* se vuoi utilizzarlo tramite file .env decommenta queste righe
	err := godotenv.Load()

	if err != nil {
		return nil, fmt.Errorf("errore nel caricamento del file .env: %v", err)
	}

	*/

	// Costruisci la stringa di connessione (DSN) usando os.Getenv

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s",
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_HOST"),
		os.Getenv("DB_PORT"),
		os.Getenv("DB_NAME"),
	)

	// Connettiti
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}

	// Verifica la connessione
	if err := db.Ping(); err != nil {
		log.Fatal(err)
		return nil, err
	}

	fmt.Println("✅ Connessione a MySQL stabilita con successo!")

	return db, nil

}

// ------------------- GESTIONE CIFRATURA E HASHING -----------------------------------

func CheckPassword(password_input string, hash_stored string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash_stored), []byte(password_input))
	// Se err è nil, la password è corretta
	return err == nil
}

func Hashing(password string) (string, error) {

	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)

	return string(bytes), err
}

func GeneraKey(password []byte, salt []byte) []byte {

	return argon2.IDKey(password, salt, 2, 64*1024, 2, 32)
}

func GeneraSalt(size int) ([]byte, error) {

	salt := make([]byte, size)

	_, err := io.ReadFull(rand.Reader, salt)
	if err != nil {
		return nil, err
	}
	return salt, nil
}

// -------------------------------------------------------------------------------

// ------------- GESTIONE UTENTE DI ACCESSO AL PASSWORD MANAGER ----------------

func AddUser(db *sql.DB, utente string, password string) error {

	if len(password) < 8 {
		return fmt.Errorf("password must be at least 8 characters long")
	}

	var hasNumber, hasSpecial bool
	specialChars := "!@#$%?"

	for _, char := range password {
		switch {
		case unicode.IsDigit(char):
			hasNumber = true
		case strings.ContainsRune(specialChars, char):
			hasSpecial = true
		}
	}

	if !hasNumber {
		return fmt.Errorf("password must contain at least one number")
	}
	if !hasSpecial {
		return fmt.Errorf("password must contain at least one special character")
	}

	password_hash, err := Hashing(password)
	if err != nil {
		return fmt.Errorf("hashing error: %v", err)
	}

	query_check := "SELECT 1 FROM UTENTI WHERE nome = ? LIMIT 1"

	var exists int
	err1 := db.QueryRow(query_check, utente).Scan(&exists)
	if err1 == nil {
		return fmt.Errorf("user already exists")
	} else if err1 != sql.ErrNoRows {

		return fmt.Errorf("database query error: %v", err1)
	}

	salt, err2 := GeneraSalt(16)
	if err2 != nil {
		return err2
	}
	saltBase64 := base64.StdEncoding.EncodeToString(salt)

	// Il punto interrogativo '?' è il segnaposto per MySQL
	query := "INSERT INTO UTENTI (nome,password_hash,salt) VALUES (?, ?, ?)"

	_, err3 := db.Exec(query, utente, password_hash, saltBase64)
	if err3 != nil {
		return fmt.Errorf("failed to insert user: %v", err3)
	}

	fmt.Println("utente creato correttamente!")
	return nil
}

/*func RemoveUser(db *sql.DB, utente string) error {
	query := "DELETE FROM UTENTI WHERE nome = ?"

	// db.Exec prepara la query, esegue il binding dei dati ed esegue il comando
	_, err := db.Exec(query, utente)
	if err != nil {
		return err
	}

	fmt.Println("utente rimosso correttamente!")
	return nil
}*/

func Login(db *sql.DB, utente string, password string) (bool, error, []byte) {

	var storedHash, saltBase64 string
	query := "SELECT password_hash, salt FROM UTENTI WHERE nome = ?"

	err := db.QueryRow(query, utente).Scan(&storedHash, &saltBase64)

	salt, _ := base64.StdEncoding.DecodeString(saltBase64)

	if err == sql.ErrNoRows {
		return false, fmt.Errorf("utente non trovato"), nil
	} else if err != nil {
		return false, err, nil
	}

	if CheckPassword(password, storedHash) {
		key := GeneraKey([]byte(password), salt)
		return true, nil, key
	}

	return false, fmt.Errorf("Credenziali errate (password)"), nil

}

//------------------------------------------------------------------------------

//---------- GESTIONE PASSWORD MANAGER -------------------------------------

func CifraPassword(password []byte, chiave []byte) ([]byte, error) {

	block, err := aes.NewCipher(chiave)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}

	return gcm.Seal(nonce, nonce, password, nil), nil
}

func DecifraturaPassword(password_cifrata []byte, chiave []byte) ([]byte, error) {

	block, err := aes.NewCipher(chiave)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonceSize := gcm.NonceSize()

	if len(password_cifrata) < nonceSize {
		return nil, fmt.Errorf("cyphertext troppo corto")
	}

	nonce, encryptedData := password_cifrata[:nonceSize], password_cifrata[nonceSize:]

	return gcm.Open(nil, nonce, encryptedData, nil)
}

func AddPassword(db *sql.DB, utente string, indirizzo_url string, username string, password string, chiave []byte) error {
	password_cifrata, errcifratura := CifraPassword([]byte(password), chiave)
	if errcifratura != nil {
		return fmt.Errorf("errore nella cifratura della password")
	}
	password_cifrataBase64 := base64.StdEncoding.EncodeToString(password_cifrata)
	query := "INSERT INTO PASSWORD (utente,indirizzo_url,username,password_cifrata) VALUES (?, ?, ?, ?)"

	_, err := db.Exec(query, utente, indirizzo_url, username, password_cifrataBase64)
	if err != nil {
		return err
	}

	fmt.Println("Password aggiunta correttamente!")
	return nil
}

func EditPassword(db *sql.DB, id string, utente string, indirizzo_url string, username string, password string, chiave []byte) error {
	password_cifrata, errcifratura := CifraPassword([]byte(password), chiave)
	if errcifratura != nil {
		return fmt.Errorf("errore nella cifratura della password")
	}
	password_cifrataBase64 := base64.StdEncoding.EncodeToString(password_cifrata)
	query := "UPDATE PASSWORD SET username = ? ,password_cifrata = ? WHERE utente = ? AND id = ?"

	_, err := db.Exec(query, username, password_cifrataBase64, utente, id)
	if err != nil {
		return err
	}

	fmt.Println("Password modificata correttamente!")
	return nil
}

func RemovePassword(db *sql.DB, id string, utente string) error {
	query := "DELETE FROM PASSWORD WHERE id = ? AND utente = ?"
	_, err := db.Exec(query, id, utente)
	return err
}

func GetAllPasswords(db *sql.DB, utente string, chiave []byte) ([]map[string]string, error) {
	query := "SELECT id, indirizzo_url, username, password_cifrata FROM PASSWORD WHERE utente = ?"
	rows, err := db.Query(query, utente)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var passwords []map[string]string
	for rows.Next() {
		var id int
		var url, user, passCifrataBase64 string
		if err := rows.Scan(&id, &url, &user, &passCifrataBase64); err != nil {
			continue
		}

		passCifrata, _ := base64.StdEncoding.DecodeString(passCifrataBase64)
		passDecifrata, err := DecifraturaPassword(passCifrata, chiave)
		if err != nil {
			continue
		}

		passwords = append(passwords, map[string]string{
			"id":       fmt.Sprintf("%d", id),
			"url":      url,
			"username": user,
			"password": string(passDecifrata),
		})
	}

	return passwords, nil
}

func GetPassword(db *sql.DB, indirizzo_url string, chiave []byte) error {
	query := "SELECT id, utente, username, password_cifrata FROM PASSWORD WHERE indirizzo_url = ?"
	rows, err := db.Query(query, indirizzo_url)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {

		var id int
		var utente, user, passCifrataBase64 string
		rows.Scan(&id, &utente, &user, &passCifrataBase64)

		// Decodifica Base64
		passCifrata, _ := base64.StdEncoding.DecodeString(passCifrataBase64)

		// Decifra
		passDecifrata, err := DecifraturaPassword(passCifrata, chiave)
		if err != nil {
			fmt.Println("Errore decifratura:", err)
			continue
		}

		fmt.Printf("ID: %d \n Utente: %s \n URL: %s \n User: %s 	|	Pass: %s \n", id, utente, indirizzo_url, user, string(passDecifrata))
	}

	return nil
}

// ----------------------------------------------------------------------------------------------------------
