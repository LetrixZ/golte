package action

import (
	"encoding/json"
	"net/http"
)

type ActionData = map[string]any

type ActionResultType = string

const (
	ActionResultSuccess  ActionResultType = "success"
	ActionResultFailure  ActionResultType = "failure"
	ActionResultRedirect ActionResultType = "redirect"
	ActionResultError    ActionResultType = "error"
)

type ActionResult struct {
	Type     ActionResultType
	Status   int
	Data     ActionData
	Error    *string
	Location string
}

func (a *ActionResult) ToCSR() ([]byte, error) {
	var csrResponse []byte

	switch a.Type {
	case ActionResultSuccess:
		jsonData, err := json.Marshal(a.Data)

		if err != nil {
			return nil, err
		}

		_json, err := json.Marshal(map[string]any{
			"data": string(jsonData),
			"type": ActionResultSuccess,
		})

		if err != nil {
			return nil, err
		}

		csrResponse = _json
	case ActionResultFailure:
		jsonData, err := json.Marshal(a.Data)

		if err != nil {
			return nil, err
		}

		_json, err := json.Marshal(map[string]any{
			"data":   string(jsonData),
			"status": a.Status,
			"type":   ActionResultFailure,
		})

		if err != nil {
			return nil, err
		}

		csrResponse = _json
	case ActionResultError:
		_json, err := json.Marshal(map[string]any{
			"error": map[string]any{
				"message": a.Error,
			},
			"type": ActionResultError,
		})

		if err != nil {
			return nil, err
		}

		csrResponse = _json
	case ActionResultRedirect:
		jsonData, err := json.Marshal(a.Data)

		if err != nil {
			return nil, err
		}

		_json, err := json.Marshal(map[string]any{
			"data":     string(jsonData),
			"location": a.Location,
			"status":   a.Status,
			"type":     ActionResultRedirect,
		})
		if err != nil {
			return nil, err
		}

		csrResponse = _json
	}

	return csrResponse, nil
}

func Success(data ActionData) ActionResult {
	return ActionResult{
		Type:   ActionResultSuccess,
		Status: http.StatusOK,
		Data:   data,
	}
}

func Failure(status int, data ActionData) ActionResult {
	return ActionResult{
		Type:   ActionResultFailure,
		Status: status,
		Data:   data,
	}
}

func Redirect(status int, location string, data ActionData) ActionResult {
	return ActionResult{
		Type:     ActionResultRedirect,
		Status:   status,
		Location: location,
		Data:     data,
	}
}

func Error(err error) ActionResult {
	errorMessage := err.Error()

	return ActionResult{
		Type:   ActionResultError,
		Status: http.StatusInternalServerError,
		Error:  &errorMessage,
	}
}
