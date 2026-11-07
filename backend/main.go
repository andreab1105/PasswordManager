package main

import (
	"bufio"
	"crypto/rand"
	"crypto/sha1"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"password_menager/database"
	"strings"
	"sync"
	"time"
)

func getLocalDay() string {
	loc, err := time.LoadLocation("Europe/Rome")
	if err != nil {
		// Fallback to local system time if location load fails
		return time.Now().Format("2")
	}
	return time.Now().In(loc).Format("2")
}

type SessionData struct {
	Key      []byte
	Username string
}

var (
	userSessions = make(map[string]SessionData)
	sessionMu    sync.RWMutex // Usa RWMutex per permettere letture multiple contemporanee
)

func InitDb() (*sql.DB, error) {
	var db *sql.DB
	var err error
	db, err = database.Connection()
	if err != nil {
		fmt.Println("database connection error:", err)
		return nil, err
	}

	return db, nil
}

type LoginRequest struct {
	Nome_utente string `json:"nome_utente"`
	Password    string `json:"password"`
}

func GenerateRandomID(length int) (string, error) {
	randomID := make([]byte, length)

	_, err := rand.Read(randomID)
	if err != nil {
		return "", err
	}

	// Encode to URL-safe Base64 to ensure it can be used in cookies or headers
	return base64.URLEncoding.EncodeToString(randomID), nil
}

func CheckPwnPasswords(passwords []map[string]string, utente string, db *sql.DB) error {
	todayStr := getLocalDay()
	for _, record := range passwords {

		fmt.Printf("powned: %q | clock: %q | today: %q\n", record["powned"], record["clock"], todayStr)

		if (record["powned"] != "1" && record["clock"] != todayStr) || record["powned"] == "" {

			// trasforma in sha_1 la password e prendi i primi 5 caratteri
			h := sha1.New()
			h.Write([]byte(record["password"]))
			sha1Stringa := strings.ToUpper(hex.EncodeToString(h.Sum(nil)))
			primiCinque := sha1Stringa[:5]
			resto := sha1Stringa[5:]

			url := "https://api.pwnedpasswords.com/range/" + primiCinque

			resp, err := http.Get(url)

			if err != nil {
				return err
			}

			scanner := bufio.NewScanner(resp.Body)

			trovato := false
			for scanner.Scan() {
				linea := scanner.Text()

				// Separa la riga al carattere ":"
				parti := strings.Split(linea, ":")
				if len(parti) < 2 {
					continue // Salta righe non valide
				}

				apiSuffisso := parti[0]
				conteggioBreach := parti[1]

				// Confronta il tuo suffisso con quello restituito dall'API
				if apiSuffisso == resto {
					fmt.Printf("🚨 ATTENZIONE! La password è stata violata %s volte!\n", conteggioBreach)
					database.UpdatePowned(db, record["id"], utente, "1", todayStr)
					trovato = true
					break
				}
			}

			if !trovato {
				fmt.Println("✅ Password sicura! Nessuna corrispondenza trovata nei leak.")
				database.UpdatePowned(db, record["id"], utente, "0", todayStr)

			}

			resp.Body.Close()
		}

	}
	return nil
}

func HandleCheckAuth(w http.ResponseWriter, r *http.Request) {
	// 1. MUST NOT BE "*" when using credentials
	w.Header().Set("Access-Control-Allow-Origin", "http://localhost")
	w.Header().Set("Access-Control-Allow-Credentials", "true")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	cookie, err := r.Cookie("session_token")
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	sessionID := cookie.Value

	sessionMu.RLock()
	_, exists := userSessions[sessionID]
	sessionMu.RUnlock()

	if !exists {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func LoginHandler(w http.ResponseWriter, r *http.Request, db *sql.DB) {
	// 1. Enable CORS
	w.Header().Set("Access-Control-Allow-Origin", "http://localhost")
	w.Header().Set("Access-Control-Allow-Credentials", "true")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// 2. Decode Request
	var creds LoginRequest
	err := json.NewDecoder(r.Body).Decode(&creds)
	if err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	check, err, userKey := database.Login(db, creds.Nome_utente, creds.Password)

	if check {
		// 2. Generate a random Session ID
		sessionID, err1 := GenerateRandomID(32)
		if err1 != nil {
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		sessionMu.Lock()

		// 3. Store the key in memory
		userSessions[sessionID] = SessionData{
			Key:      userKey,
			Username: creds.Nome_utente,
		}

		sessionMu.Unlock() // Sblocca

		// 4. Send the sessionID to React in a cookie or JSON
		http.SetCookie(w, &http.Cookie{
			Name:     "session_token",
			Value:    sessionID,
			Path:     "/",   // CRITICAL: Makes cookie available for all /api routes
			HttpOnly: true,  // Security: JS can't touch this cookie
			Secure:   false, // Set to true in production (HTTPS)
			SameSite: http.SameSiteLaxMode,
		})
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "logged in", "session_token": sessionID})
		return
	}

	// Always return a JSON error on failure
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	json.NewEncoder(w).Encode(map[string]string{"error": "Invalid credentials"})

}

func RegistrationHandler(w http.ResponseWriter, r *http.Request, db *sql.DB) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	var creds LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&creds); err != nil {
		http.Error(w, "Invalid input", http.StatusBadRequest)
		return
	}
	if creds.Nome_utente == "" || creds.Password == "" {
		http.Error(w, "Missing username or password", http.StatusBadRequest)
		return
	}
	err := database.AddUser(db, creds.Nome_utente, creds.Password)
	if err != nil {
		http.Error(w, "Registration failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"status": "registered"})

}

func HandleAddPassword(w http.ResponseWriter, r *http.Request, db *sql.DB) {
	w.Header().Set("Access-Control-Allow-Origin", "http://localhost")
	w.Header().Set("Access-Control-Allow-Credentials", "true")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	cookie, err := r.Cookie("session_token")
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	sessionID := cookie.Value

	sessionMu.RLock()
	userKey, exists := userSessions[sessionID]
	sessionMu.RUnlock()

	if !exists {
		http.Error(w, "Session expired", http.StatusUnauthorized)
		return
	}

	var req struct {
		URL      string `json:"url"`
		Username string `json:"username"`
		Password string `json:"password"`
		OTP      string `json:"otp"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid input", http.StatusBadRequest)
		return
	}

	err2 := database.AddPassword(db, userKey.Username, req.URL, req.Username, req.Password, req.OTP, userKey.Key)
	if err2 != nil {
		http.Error(w, "Failed to save: "+err2.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "password added"})
}

func HandleEditPassword(w http.ResponseWriter, r *http.Request, db *sql.DB) {
	w.Header().Set("Access-Control-Allow-Origin", "http://localhost")
	w.Header().Set("Access-Control-Allow-Credentials", "true")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	cookie, err := r.Cookie("session_token")
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	sessionID := cookie.Value

	sessionMu.RLock()
	userKey, exists := userSessions[sessionID]
	sessionMu.RUnlock()

	if !exists {
		http.Error(w, "Session expired", http.StatusUnauthorized)
		return
	}

	path := r.URL.Path
	var id string
	for i := len(path) - 1; i >= 0; i-- {
		if path[i] == '/' {
			id = path[i+1:]
			break
		}
	}

	var req struct {
		URL      string `json:"url"`
		Username string `json:"username"`
		Password string `json:"password"`
		OTP      string `json:"otp"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid input", http.StatusBadRequest)
		return
	}

	err1 := database.EditPassword(db, id, userKey.Username, req.URL, req.Username, req.Password, req.OTP, userKey.Key)
	if err1 != nil {
		http.Error(w, "Failed to save: "+err1.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "password edited"})

}

func HandleRemovePassword(w http.ResponseWriter, r *http.Request, db *sql.DB) {
	w.Header().Set("Access-Control-Allow-Origin", "http://localhost")
	w.Header().Set("Access-Control-Allow-Credentials", "true")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Methods", "DELETE, OPTIONS")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	cookie, err := r.Cookie("session_token")
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	sessionID := cookie.Value

	sessionMu.RLock()
	userKey, exists := userSessions[sessionID]
	sessionMu.RUnlock()

	if !exists {
		http.Error(w, "Session expired", http.StatusUnauthorized)
		return
	}

	// Extract ID from URL path
	path := r.URL.Path
	var id string
	for i := len(path) - 1; i >= 0; i-- {
		if path[i] == '/' {
			id = path[i+1:]
			break
		}
	}

	err2 := database.RemovePassword(db, id, userKey.Username)
	if err2 != nil {
		http.Error(w, "Failed to delete: "+err2.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "password deleted"})
}

func HandleGetPassword(w http.ResponseWriter, r *http.Request, db *sql.DB) {
	w.Header().Set("Access-Control-Allow-Origin", "http://localhost")
	w.Header().Set("Access-Control-Allow-Credentials", "true")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	cookie, err := r.Cookie("session_token")
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	sessionID := cookie.Value

	sessionMu.RLock()
	userKey, exists := userSessions[sessionID]
	sessionMu.RUnlock()

	if !exists {
		http.Error(w, "Session expired", http.StatusUnauthorized)
		return
	}

	passwords, err := database.GetAllPasswords(db, userKey.Username, userKey.Key)
	if err != nil {
		http.Error(w, "Failed to get passwords: "+err.Error(), http.StatusInternalServerError)
		return
	}

	CheckPwnPasswords(passwords, userKey.Username, db)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(passwords)
}

func main() {
	db, err := InitDb()
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close() // Closes the pool only when the app shuts down

	rows, err := db.Query("SHOW TABLES")
	if err != nil {
		log.Fatal("Could not list tables: ", err)
	}
	defer rows.Close()

	fmt.Println("🔍 Tables found in the database:")
	for rows.Next() {
		var tableName string
		rows.Scan(&tableName)
		fmt.Printf("- %s\n", tableName)
	}

	http.HandleFunc("/api/check-auth", func(w http.ResponseWriter, r *http.Request) {
		HandleCheckAuth(w, r)
	})

	http.HandleFunc("/api/login", func(w http.ResponseWriter, r *http.Request) {
		LoginHandler(w, r, db)
	})

	http.HandleFunc("/api/register", func(w http.ResponseWriter, r *http.Request) {
		RegistrationHandler(w, r, db)
	})

	http.HandleFunc("/api/aggiungi", func(w http.ResponseWriter, r *http.Request) {
		HandleAddPassword(w, r, db)

	})

	http.HandleFunc("/api/modifica/", func(w http.ResponseWriter, r *http.Request) {
		HandleEditPassword(w, r, db)

	})

	http.HandleFunc("/api/cerca_Password", func(w http.ResponseWriter, r *http.Request) {
		HandleGetPassword(w, r, db)

	})

	http.HandleFunc("/api/elimina_password/", func(w http.ResponseWriter, r *http.Request) {
		HandleRemovePassword(w, r, db)

	})

	fmt.Println("🚀 Server running on http://0.0.0.0:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))

}
